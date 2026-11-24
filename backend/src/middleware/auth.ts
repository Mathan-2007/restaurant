import type { RequestHandler } from 'express';
import type { RoleName } from '@prisma/client';
import { prisma } from '../config/database.js';
import { ApiError } from '../utils/api.js';

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const sessionId = req.cookies?.sid;
    if (!sessionId) throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    const session = await prisma.session.findFirst({
      where: { id: sessionId, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: { include: { role: true } } },
    });
    if (!session || session.user.status !== 'ACTIVE') throw new ApiError(401, 'Session is invalid or expired', 'SESSION_INVALID');
    req.auth = { userId: session.userId, role: session.user.role.name, sessionId: session.id };
    next();
  } catch (error) { next(error); }
};

export function requireRole(...roles: RoleName[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(new ApiError(401, 'Authentication required', 'AUTH_REQUIRED'));
    if (req.auth.role !== 'ADMIN' && !roles.includes(req.auth.role)) return next(new ApiError(403, 'Insufficient permissions', 'FORBIDDEN_ROLE'));
    next();
  };
}

export async function canAccessShop(userId: string, role: RoleName, shopId: string) {
  if (role === 'ADMIN') return true;
  if (role === 'MANAGER') return !!await prisma.managerShopAssignment.findUnique({ where: { userId_shopId: { userId, shopId } } });
  return !!await prisma.employeeShopAssignment.findUnique({ where: { userId_shopId: { userId, shopId } } });
}

export const requireShop: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.auth) throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    const shopId = String(req.params.shopId || req.body?.shopId || req.query.shopId || '');
    if (!shopId) throw new ApiError(400, 'shopId is required', 'SHOP_REQUIRED');
    if (!await canAccessShop(req.auth.userId, req.auth.role, shopId)) throw new ApiError(403, 'You cannot access this shop', 'SHOP_FORBIDDEN');
    next();
  } catch (error) { next(error); }
};
