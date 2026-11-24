import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole, requireShop } from '../../middleware/auth.js';
import { ApiError, ok } from '../../utils/api.js';
import { randomUUID } from 'node:crypto';

export const employeesRouter = Router();
employeesRouter.use(requireAuth, requireRole('MANAGER'));

const employeeSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(20).optional(),
  role: z.enum(['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN_STAFF']),
  shopIds: z.array(z.string().min(1)).min(1).max(20),
  password: z.string().min(12).max(128).optional(),
});

employeesRouter.get('/:shopId', requireShop, async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page = Math.max(1, Number(req.query.page || 1));
    const take = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const where: any = {
      ...(search ? { OR: [{ fullName: { contains: search } }, { email: { contains: search } }] } : {}),
      ...(role ? { role: { name: role } } : {}),
      ...(status ? { status } : {}),
      OR: [{ employeeAssignments: { some: { shopId: req.params.shopId } } }, { managerAssignments: { some: { shopId: req.params.shopId } } }],
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, include: { role: true, profile: true, employeeAssignments: { include: { shop: true } }, managerAssignments: { include: { shop: true } } }, orderBy: { fullName: 'asc' }, skip: (page - 1) * take, take }),
      prisma.user.count({ where }),
    ]);
    ok(res, { items, pagination: { page, limit: take, total, pages: Math.ceil(total / take) } });
  } catch (error) { next(error); }
});

employeesRouter.post('/:shopId', requireShop, async (req, res, next) => {
  try {
    const input = employeeSchema.parse(req.body);
    const unauthorizedShop = req.auth!.role === 'ADMIN' ? [] : await prisma.managerShopAssignment.findMany({ where: { userId: req.auth!.userId, shopId: { in: input.shopIds } }, select: { shopId: true } });
    if (req.auth!.role !== 'ADMIN' && unauthorizedShop.length !== new Set(input.shopIds).size) throw new ApiError(403, 'Cannot assign employees to an unauthorized shop', 'SHOP_FORBIDDEN');
    if (input.role !== 'MANAGER' && input.shopIds.length !== 1) throw new ApiError(400, 'Non-manager employees must belong to exactly one shop', 'INVALID_SHOP_ASSIGNMENT');
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ApiError(409, 'Email is already registered', 'EMAIL_EXISTS');
    const role = await prisma.role.findUnique({ where: { name: input.role } });
    if (!role) throw new ApiError(400, 'Invalid employee role', 'INVALID_ROLE');

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { fullName: input.fullName, email: input.email, phone: input.phone, passwordHash: await argon2.hash(input.password || 'Change-Me-Now-' + randomUUID().slice(0, 12), { type: argon2.argon2id }), roleId: role.id, profile: { create: {} } } });
      if (input.role === 'MANAGER') await tx.managerShopAssignment.createMany({ data: input.shopIds.map((shopId) => ({ userId: created.id, shopId })) });
      else await tx.employeeShopAssignment.create({ data: { userId: created.id, shopId: input.shopIds[0] } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'EMPLOYEE_CREATED', resourceType: 'user', resourceId: created.id, requestId: String(req.headers['x-request-id']), afterJson: { email: created.email, role: input.role, shopIds: input.shopIds } } });
      return created;
    });
    ok(res, { id: user.id, email: user.email, fullName: user.fullName }, 201);
  } catch (error) { next(error); }
});

const updateSchema = z.object({ fullName: z.string().trim().min(2).max(100).optional(), phone: z.string().trim().max(20).optional(), role: z.enum(['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN_STAFF']).optional(), status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']).optional(), shopIds: z.array(z.string()).optional() });

employeesRouter.patch('/:shopId/:userId', requireShop, async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, include: { role: true, employeeAssignments: true, managerAssignments: true } });
    if (!user) throw new ApiError(404, 'Employee not found', 'EMPLOYEE_NOT_FOUND');
    const belongs = req.auth!.role === 'ADMIN' || user.employeeAssignments.some((a) => a.shopId === req.params.shopId) || user.managerAssignments.some((a) => a.shopId === req.params.shopId);
    if (!belongs) throw new ApiError(403, 'Employee does not belong to this shop', 'EMPLOYEE_SHOP_FORBIDDEN');

    const updated = await prisma.$transaction(async (tx) => {
      const role = input.role ? await tx.role.findUnique({ where: { name: input.role } }) : null;
      const value = await tx.user.update({ where: { id: user.id }, data: { ...(input.fullName ? { fullName: input.fullName } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}), ...(input.status ? { status: input.status } : {}), ...(role ? { roleId: role.id } : {}) } });
      if (input.status && input.status !== 'ACTIVE') await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (input.shopIds) {
        const authorized = req.auth!.role === 'ADMIN' ? input.shopIds.map((shopId) => ({ shopId })) : await tx.managerShopAssignment.findMany({ where: { userId: req.auth!.userId, shopId: { in: input.shopIds } }, select: { shopId: true } });
        if (authorized.length !== new Set(input.shopIds).size) throw new ApiError(403, 'Cannot assign unauthorized shops', 'SHOP_FORBIDDEN');
        await tx.employeeShopAssignment.deleteMany({ where: { userId: user.id } });
        await tx.managerShopAssignment.deleteMany({ where: { userId: user.id } });
        if ((input.role || user.role.name) === 'MANAGER') await tx.managerShopAssignment.createMany({ data: input.shopIds.map((shopId) => ({ userId: user.id, shopId })) });
        else {
          if (input.shopIds.length !== 1) throw new ApiError(400, 'Non-manager employees must have exactly one shop', 'INVALID_SHOP_ASSIGNMENT');
          await tx.employeeShopAssignment.create({ data: { userId: user.id, shopId: input.shopIds[0] } });
        }
      }
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'EMPLOYEE_UPDATED', resourceType: 'user', resourceId: user.id, requestId: String(req.headers['x-request-id']), beforeJson: { role: user.role.name, status: user.status, fullName: user.fullName }, afterJson: input } });
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

employeesRouter.post('/:shopId/:userId/reset-password', requireShop, async (req, res, next) => {
  try {
    const input = z.object({ password: z.string().min(12).max(128) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, include: { employeeAssignments: true, managerAssignments: true } });
    if (!user) throw new ApiError(404, 'Employee not found', 'EMPLOYEE_NOT_FOUND');
    const belongs = user.employeeAssignments.some((a) => a.shopId === req.params.shopId) || user.managerAssignments.some((a) => a.shopId === req.params.shopId);
    if (!belongs) throw new ApiError(403, 'Employee does not belong to this shop', 'EMPLOYEE_SHOP_FORBIDDEN');
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }) } });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'EMPLOYEE_PASSWORD_RESET', resourceType: 'user', resourceId: user.id, requestId: String(req.headers['x-request-id']) } });
    });
    ok(res, { reset: true });
  } catch (error) { next(error); }
});

employeesRouter.get('/:shopId/:userId/activity', requireShop, async (req, res, next) => {
  try {
    const [audit, tasks, shifts] = await Promise.all([
      prisma.auditLog.findMany({ where: { actorId: req.params.userId, shopId: req.params.shopId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.taskAssignmentMember.findMany({ where: { userId: req.params.userId, assignment: { shopId: req.params.shopId } }, include: { assignment: true }, orderBy: { id: 'desc' }, take: 100 }),
      prisma.shift.findMany({ where: { userId: req.params.userId, shopId: req.params.shopId }, orderBy: { startsAt: 'desc' }, take: 100 }),
    ]);
    ok(res, { audit, tasks, shifts });
  } catch (error) { next(error); }
});

const shiftSchema = z.object({ userId: z.string().min(1), name: z.string().trim().min(2).max(80), startsAt: z.coerce.date(), endsAt: z.coerce.date() }).refine((value) => value.endsAt > value.startsAt, { message: 'endsAt must be after startsAt' });

employeesRouter.get('/:shopId/shifts', requireShop, async (req, res, next) => {
  try {
    const start = typeof req.query.start === 'string' ? new Date(req.query.start) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = typeof req.query.end === 'string' ? new Date(req.query.end) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    ok(res, await prisma.shift.findMany({ where: { shopId: req.params.shopId, startsAt: { gte: start, lt: end } }, include: { user: { select: { id: true, fullName: true, role: true } } }, orderBy: { startsAt: 'asc' } }));
  } catch (error) { next(error); }
});

employeesRouter.post('/:shopId/shifts', requireShop, async (req, res, next) => {
  try {
    const input = shiftSchema.parse(req.body);
    const assignment = await prisma.employeeShopAssignment.findUnique({ where: { userId_shopId: { userId: input.userId, shopId: req.params.shopId } } });
    const managerAssignment = await prisma.managerShopAssignment.findUnique({ where: { userId_shopId: { userId: input.userId, shopId: req.params.shopId } } });
    if (!assignment && !managerAssignment) throw new ApiError(403, 'Employee is not assigned to this shop', 'EMPLOYEE_SHOP_FORBIDDEN');
    const shift = await prisma.$transaction(async (tx) => {
      const value = await tx.shift.create({ data: { shopId: req.params.shopId, userId: input.userId, name: input.name, startsAt: input.startsAt, endsAt: input.endsAt } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'SHIFT_CREATED', resourceType: 'shift', resourceId: value.id, requestId: String(req.headers['x-request-id']), afterJson: input } });
      return value;
    });
    ok(res, shift, 201);
  } catch (error) { next(error); }
});

employeesRouter.delete('/:shopId/shifts/:shiftId', requireShop, async (req, res, next) => {
  try {
    const shift = await prisma.shift.findFirst({ where: { id: req.params.shiftId, shopId: req.params.shopId } });
    if (!shift) throw new ApiError(404, 'Shift not found', 'SHIFT_NOT_FOUND');
    await prisma.$transaction(async (tx) => {
      await tx.shift.delete({ where: { id: shift.id } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'SHIFT_DELETED', resourceType: 'shift', resourceId: shift.id, requestId: String(req.headers['x-request-id']), beforeJson: shift } });
    });
    ok(res, { deleted: true });
  } catch (error) { next(error); }
});
