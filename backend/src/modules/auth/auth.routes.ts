import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ApiError, ok } from '../../utils/api.js';
import { requireAuth } from '../../middleware/auth.js';
import { createCsrfToken } from '../../middleware/csrf.js';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });

const loginSchema = z.object({ email: z.email().transform((value) => value.toLowerCase()), password: z.string().min(8).max(128) });

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email }, include: { role: true } });
    if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }
    const oldSessionId = req.cookies?.sid;
    if (oldSessionId) await prisma.session.updateMany({ where: { id: oldSessionId }, data: { revokedAt: new Date() } });

    const session = await prisma.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), csrfTokenHash: 'managed-by-signed-cookie', userAgent: req.get('user-agent')?.slice(0, 250), ipAddress: req.ip?.slice(0, 45) },
    });
    res.cookie('sid', session.id, { httpOnly: true, secure: env.COOKIE_SECURE === 'true', sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax', maxAge: 12 * 60 * 60 * 1000, path: '/' });
    await prisma.auditLog.create({ data: { actorId: user.id, action: 'AUTH_LOGIN', resourceType: 'session', resourceId: session.id, requestId: String(req.headers['x-request-id']) } });
    ok(res, { user: { id: user.id, name: user.fullName, email: user.email, role: user.role.name }, csrfToken: createCsrfToken(session.id) });
  } catch (error) { next(error); }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, include: { role: true, employeeAssignments: { include: { shop: true } }, managerAssignments: { include: { shop: true } } } });
    if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    ok(res, { id: user.id, name: user.fullName, email: user.email, role: user.role.name, employeeShops: user.employeeAssignments.map((a) => ({ id: a.shop.id, code: a.shop.code, name: a.shop.name })), managerShops: user.managerAssignments.map((a) => ({ id: a.shop.id, code: a.shop.code, name: a.shop.name })) });
  } catch (error) { next(error); }
});

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await prisma.session.update({ where: { id: req.auth!.sessionId }, data: { revokedAt: new Date() } });
    await prisma.auditLog.create({ data: { actorId: req.auth!.userId, action: 'AUTH_LOGOUT', resourceType: 'session', resourceId: req.auth!.sessionId, requestId: String(req.headers['x-request-id']) } });
    res.clearCookie('sid', { path: '/' });
    ok(res, { loggedOut: true });
  } catch (error) { next(error); }
});

const passwordSchema = z.object({ currentPassword: z.string().min(8), newPassword: z.string().min(12).max(128) });
authRouter.post('/password', requireAuth, async (req, res, next) => {
  try {
    const input = passwordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user || !(await argon2.verify(user.passwordHash, input.currentPassword))) throw new ApiError(400, 'Current password is incorrect', 'PASSWORD_INCORRECT');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(input.newPassword, { type: argon2.argon2id }) } });
    await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.auditLog.create({ data: { actorId: user.id, action: 'PASSWORD_CHANGE', resourceType: 'user', resourceId: user.id, requestId: String(req.headers['x-request-id']) } });
    res.clearCookie('sid', { path: '/' });
    ok(res, { changed: true });
  } catch (error) { next(error); }
});
