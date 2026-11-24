import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole, requireShop } from '../../middleware/auth.js';
import { ApiError, ok } from '../../utils/api.js';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

const lineSchema = z.object({ menuItemId: z.string().min(1), quantity: z.number().int().min(1).max(99), instructions: z.string().max(300).optional() });
const createSchema = z.object({ type: z.enum(['DINE_IN', 'TAKEAWAY']), tableSessionId: z.string().optional(), items: z.array(lineSchema).min(1), version: z.number().int().optional() });

ordersRouter.get('/:shopId', requireShop, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const take = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const where: any = { shopId: req.params.shopId, ...(status ? { status: status as any } : {}) };
    const [items, total] = await Promise.all([prisma.order.findMany({ where, include: { items: true, kitchenTickets: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take }), prisma.order.count({ where })]);
    ok(res, { items, pagination: { page, limit: take, total, pages: Math.ceil(total / take) } });
  } catch (error) { next(error); }
});

ordersRouter.post('/:shopId', requireRole('WAITER', 'CASHIER'), requireShop, async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const idem = req.headers['idempotency-key'];
    if (typeof idem !== 'string' || idem.length < 8 || idem.length > 200) throw new ApiError(400, 'An idempotency key is required', 'IDEMPOTENCY_REQUIRED');
    const existing = await prisma.idempotencyKey.findUnique({ where: { key: idem } });
    if (existing) { ok(res, existing.resultJson); return; }

    const order = await prisma.$transaction(async (tx) => {
      const menuItems = await tx.menuItem.findMany({ where: { id: { in: input.items.map((item) => item.menuItemId) }, active: true, soldOut: false, category: { shopId: req.params.shopId } } });
      if (menuItems.length !== new Set(input.items.map((item) => item.menuItemId)).size) throw new ApiError(400, 'One or more menu items are unavailable', 'MENU_ITEM_UNAVAILABLE');
      const priceMap = new Map(menuItems.map((item) => [item.id, item]));
      const lines = input.items.map((line) => { const item = priceMap.get(line.menuItemId)!; const unitPrice = Number(item.price); return { menuItemId: item.id, nameSnapshot: item.name, quantity: line.quantity, unitPrice: item.price, lineTotal: (unitPrice * line.quantity).toFixed(2), instructions: line.instructions }; });
      const subtotal = lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
      const shop = await tx.shop.findUnique({ where: { id: req.params.shopId }, include: { settings: true } });
      const taxPercent = Number(shop?.settings?.taxPercent ?? 0);
      const tax = subtotal * taxPercent / 100;
      const total = subtotal + tax;
      const count = await tx.order.count({ where: { shopId: req.params.shopId } });
      const created = await tx.order.create({ data: { shopId: req.params.shopId, orderNumber: `ORD-${req.params.shopId.slice(-6).toUpperCase()}-${String(count + 1).padStart(6, '0')}`, type: input.type, status: 'SUBMITTED', tableSessionId: input.tableSessionId, createdById: req.auth!.userId, subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: total.toFixed(2), items: { create: lines }, statusHistory: { create: { status: 'SUBMITTED', changedById: req.auth!.userId } } }, include: { items: true } });
      const ticket = await tx.kitchenTicket.create({ data: { shopId: req.params.shopId, orderId: created.id, revisionNumber: 1, status: 'NEW', items: { create: created.items.map((item) => ({ name: item.nameSnapshot, quantity: item.quantity })) } } });
      await tx.outboxEvent.create({ data: { type: 'order.created', payload: { shopId: req.params.shopId, orderId: created.id, ticketId: ticket.id } } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'ORDER_CREATED', resourceType: 'order', resourceId: created.id, requestId: String(req.headers['x-request-id']), afterJson: { orderNumber: created.orderNumber, total: created.total.toString(), type: created.type } } });
      await tx.idempotencyKey.create({ data: { key: idem, scope: 'order.create', resultJson: created as any, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
      return created;
    });
    ok(res, order, 201);
  } catch (error) { next(error); }
});

ordersRouter.patch('/:shopId/:orderId', requireRole('WAITER', 'MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ version: z.number().int().min(1), reason: z.string().trim().min(3).max(300), items: z.array(lineSchema).min(1) }).parse(req.body);
    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: req.params.orderId, shopId: req.params.shopId }, include: { items: true } });
      if (!order) throw new ApiError(404, 'Order not found', 'ORDER_NOT_FOUND');
      if (order.version !== input.version) throw new ApiError(409, 'Order changed; refresh and retry', 'OPTIMISTIC_CONFLICT');
      if (!['SUBMITTED', 'ACCEPTED', 'PREPARING'].includes(order.status)) throw new ApiError(409, 'This order can no longer be edited', 'ORDER_EDIT_NOT_ALLOWED');
      const menuItems = await tx.menuItem.findMany({ where: { id: { in: input.items.map((item) => item.menuItemId) }, category: { shopId: req.params.shopId }, active: true, soldOut: false } });
      if (menuItems.length !== new Set(input.items.map((item) => item.menuItemId)).size) throw new ApiError(400, 'One or more menu items are unavailable', 'MENU_ITEM_UNAVAILABLE');
      const map = new Map(menuItems.map((item) => [item.id, item]));
      const before = order.items.map((item) => ({ id: item.id, name: item.nameSnapshot, quantity: item.quantity, instructions: item.instructions }));
      await tx.orderItem.deleteMany({ where: { orderId: order.id } });
      const lines = input.items.map((line) => { const item = map.get(line.menuItemId)!; const lineTotal = (Number(item.price) * line.quantity).toFixed(2); return { orderId: order.id, menuItemId: item.id, nameSnapshot: item.name, quantity: line.quantity, unitPrice: item.price, lineTotal, instructions: line.instructions }; });
      await tx.orderItem.createMany({ data: lines });
      const subtotal = lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
      const shop = await tx.shop.findUnique({ where: { id: req.params.shopId }, include: { settings: true } });
      const tax = subtotal * Number(shop?.settings?.taxPercent ?? 0) / 100;
      const revisionNumber = order.version + 1;
      await tx.orderRevision.create({ data: { orderId: order.id, revisionNumber, editedById: req.auth!.userId, reason: input.reason, beforeJson: before, afterJson: input.items } });
      await tx.kitchenTicket.create({ data: { shopId: req.params.shopId, orderId: order.id, revisionNumber, status: 'EDITED', items: { create: lines.map((line) => ({ name: line.nameSnapshot, quantity: line.quantity, changeType: 'ADDED' })) } } });
      await tx.outboxEvent.create({ data: { type: 'order.updated', payload: { shopId: req.params.shopId, orderId: order.id, revisionNumber } } });
      const value = await tx.order.update({ where: { id: order.id }, data: { version: revisionNumber, subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: (subtotal + tax).toFixed(2), status: 'SUBMITTED' } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'ORDER_EDITED', resourceType: 'order', resourceId: order.id, requestId: String(req.headers['x-request-id']), beforeJson: before, afterJson: input.items } });
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

const statusSchema = z.object({ status: z.enum(['CANCELLED', 'AWAITING_PAYMENT', 'READY', 'SERVED']) });
ordersRouter.post('/:shopId/:orderId/status', requireShop, async (req, res, next) => {
  try {
    const input = statusSchema.parse(req.body);
    const order = await prisma.order.findFirst({ where: { id: req.params.orderId, shopId: req.params.shopId } });
    if (!order) throw new ApiError(404, 'Order not found', 'ORDER_NOT_FOUND');
    if (order.status === 'PAID' || order.status === 'COMPLETED') throw new ApiError(409, 'A paid order cannot change operational status', 'ORDER_PAID');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.order.update({ where: { id: order.id }, data: { status: input.status } });
      await tx.orderStatusHistory.create({ data: { orderId: order.id, status: input.status, changedById: req.auth!.userId } });
      await tx.outboxEvent.create({ data: { type: input.status === 'CANCELLED' ? 'order.cancelled' : 'order.updated', payload: { shopId: req.params.shopId, orderId: order.id, status: input.status } } });
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});
