import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole, requireShop } from '../../middleware/auth.js';
import { ApiError, ok } from '../../utils/api.js';

export const shopsRouter = Router();

shopsRouter.use(requireAuth);

shopsRouter.get('/', async (req, res, next) => {
  try {
    const role = req.auth!.role;
    const userId = req.auth!.userId;
    const shops = role === 'MANAGER'
      ? await prisma.shop.findMany({ where: { managerAssignments: { some: { userId } } }, include: { settings: true } })
      : role === 'ADMIN'
        ? await prisma.shop.findMany({ include: { settings: true } })
        : await prisma.shop.findMany({ where: { employeeAssignments: { some: { userId } } }, include: { settings: true } });
    ok(res, shops);
  } catch (error) { next(error); }
});

shopsRouter.get('/:shopId/dashboard', requireRole('MANAGER', 'ADMIN'), requireShop, async (req, res, next) => {
  try {
    const shopId = req.params.shopId;
    const [shop, orders, tasks, inventory] = await Promise.all([
      prisma.shop.findUnique({ where: { id: shopId }, include: { settings: true } }),
      prisma.order.groupBy({ by: ['status'], where: { shopId, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }, _count: { _all: true }, _sum: { total: true } }),
      prisma.taskAssignment.groupBy({ by: ['status'], where: { shopId }, _count: { _all: true } }),
      prisma.inventoryItem.findMany({ where: { shopId }, take: 100 }),
    ]);
    if (!shop) throw new ApiError(404, 'Shop not found', 'SHOP_NOT_FOUND');
    const inventoryAlerts = inventory.filter((item) => Number(item.quantity) < Number(item.minimum)).slice(0, 20);
    ok(res, { shop, orders, tasks, inventoryAlerts });
  } catch (error) { next(error); }
});

shopsRouter.get('/:shopId/tables', requireShop, async (req, res, next) => {
  try { ok(res, await prisma.restaurantTable.findMany({ where: { shopId: req.params.shopId, active: true }, orderBy: { number: 'asc' } })); }
  catch (error) { next(error); }
});

shopsRouter.get('/:shopId/settings', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const shop = await prisma.shop.findUnique({ where: { id: req.params.shopId }, include: { settings: true } });
    if (!shop) throw new ApiError(404, 'Shop not found', 'SHOP_NOT_FOUND');
    ok(res, { shop: { id: shop.id, code: shop.code, name: shop.name, address: shop.address, phone: shop.phone, timezone: shop.timezone }, settings: shop.settings });
  } catch (error) { next(error); }
});

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(), address: z.string().trim().max(300).nullable().optional(), phone: z.string().trim().max(30).nullable().optional(), timezone: z.string().trim().min(2).max(80).optional(),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(), takeawayStartsBeforePayment: z.boolean().optional(), dineInAvailable: z.boolean().optional(), takeawayAvailable: z.boolean().optional(),
  openingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), closingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), orderStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), orderEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  taxPercent: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), refundApprovalRequired: z.boolean().optional(),
});

shopsRouter.patch('/:shopId/settings', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = settingsSchema.parse(req.body);
    const before = await prisma.shop.findUnique({ where: { id: req.params.shopId }, include: { settings: true } });
    if (!before) throw new ApiError(404, 'Shop not found', 'SHOP_NOT_FOUND');
    const updated = await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.update({ where: { id: req.params.shopId }, data: { ...(input.name ? { name: input.name } : {}), ...(input.address !== undefined ? { address: input.address } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}), ...(input.timezone ? { timezone: input.timezone } : {}) } });
      const settings = await tx.shopSettings.upsert({
        where: { shopId: req.params.shopId },
        create: { shopId: req.params.shopId, currency: input.currency || 'INR', timezone: input.timezone || 'Asia/Kolkata', taxPercent: input.taxPercent || '0', takeawayStartsBeforePayment: input.takeawayStartsBeforePayment || false, dineInAvailable: input.dineInAvailable ?? true, takeawayAvailable: input.takeawayAvailable ?? true, openingTime: input.openingTime, closingTime: input.closingTime, orderStartTime: input.orderStartTime, orderEndTime: input.orderEndTime, refundApprovalRequired: input.refundApprovalRequired ?? true },
        update: { ...(input.currency ? { currency: input.currency } : {}), ...(input.timezone ? { timezone: input.timezone } : {}), ...(input.taxPercent ? { taxPercent: input.taxPercent } : {}), ...(input.takeawayStartsBeforePayment !== undefined ? { takeawayStartsBeforePayment: input.takeawayStartsBeforePayment } : {}), ...(input.dineInAvailable !== undefined ? { dineInAvailable: input.dineInAvailable } : {}), ...(input.takeawayAvailable !== undefined ? { takeawayAvailable: input.takeawayAvailable } : {}), ...(input.openingTime !== undefined ? { openingTime: input.openingTime } : {}), ...(input.closingTime !== undefined ? { closingTime: input.closingTime } : {}), ...(input.orderStartTime !== undefined ? { orderStartTime: input.orderStartTime } : {}), ...(input.orderEndTime !== undefined ? { orderEndTime: input.orderEndTime } : {}), ...(input.refundApprovalRequired !== undefined ? { refundApprovalRequired: input.refundApprovalRequired } : {}) },
      });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'SHOP_SETTINGS_UPDATED', resourceType: 'shop', resourceId: req.params.shopId, requestId: String(req.headers['x-request-id']), beforeJson: { shop: before, settings: before.settings }, afterJson: input } });
      return { shop, settings };
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

const tableSchema = z.object({ number: z.string().trim().min(1).max(20), name: z.string().trim().max(80).optional(), diningArea: z.string().trim().min(1).max(80).default('Main Hall'), capacity: z.number().int().min(1).max(40), status: z.enum(['AVAILABLE', 'OCCUPIED', 'AWAITING_ORDER', 'ORDER_IN_PROGRESS', 'AWAITING_PAYMENT', 'PAID', 'CLEANING', 'RESERVED', 'UNAVAILABLE']).optional() });

shopsRouter.post('/:shopId/tables', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = tableSchema.parse(req.body);
    const exists = await prisma.restaurantTable.findUnique({ where: { shopId_number: { shopId: req.params.shopId, number: input.number } } });
    if (exists) throw new ApiError(409, 'Table number already exists in this shop', 'TABLE_EXISTS');
    const table = await prisma.$transaction(async (tx) => {
      const value = await tx.restaurantTable.create({ data: { shopId: req.params.shopId, number: input.number, name: input.name, diningArea: input.diningArea, capacity: input.capacity, status: input.status || 'AVAILABLE' } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TABLE_CREATED', resourceType: 'restaurant_table', resourceId: value.id, requestId: String(req.headers['x-request-id']), afterJson: input } });
      return value;
    });
    ok(res, table, 201);
  } catch (error) { next(error); }
});

const tableUpdateSchema = tableSchema.partial().omit({ number: true }).extend({ number: z.string().trim().min(1).max(20).optional() });
shopsRouter.patch('/:shopId/tables/:tableId', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = tableUpdateSchema.parse(req.body);
    const table = await prisma.restaurantTable.findFirst({ where: { id: req.params.tableId, shopId: req.params.shopId } });
    if (!table) throw new ApiError(404, 'Table not found', 'TABLE_NOT_FOUND');
    if (input.number && input.number !== table.number) {
      const exists = await prisma.restaurantTable.findUnique({ where: { shopId_number: { shopId: req.params.shopId, number: input.number } } });
      if (exists) throw new ApiError(409, 'Table number already exists', 'TABLE_EXISTS');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.restaurantTable.update({ where: { id: table.id }, data: input });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TABLE_UPDATED', resourceType: 'restaurant_table', resourceId: table.id, requestId: String(req.headers['x-request-id']), beforeJson: table, afterJson: input } });
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

shopsRouter.post('/:shopId/tables/:tableId/archive', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const table = await prisma.restaurantTable.findFirst({ where: { id: req.params.tableId, shopId: req.params.shopId }, include: { sessions: { where: { active: true }, include: { orders: true } } } });
    if (!table) throw new ApiError(404, 'Table not found', 'TABLE_NOT_FOUND');
    const unresolved = table.sessions.flatMap((session) => session.orders).some((order) => !['PAID', 'COMPLETED', 'CANCELLED'].includes(order.status));
    if (unresolved) throw new ApiError(409, 'Cannot archive a table with unresolved orders', 'TABLE_HAS_UNRESOLVED_ORDERS');
    const archived = await prisma.$transaction(async (tx) => {
      const value = await tx.restaurantTable.update({ where: { id: table.id }, data: { active: false, archivedAt: new Date(), status: 'UNAVAILABLE' } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TABLE_ARCHIVED', resourceType: 'restaurant_table', resourceId: table.id, requestId: String(req.headers['x-request-id']), beforeJson: table, afterJson: { active: false } } });
      return value;
    });
    ok(res, archived);
  } catch (error) { next(error); }
});
