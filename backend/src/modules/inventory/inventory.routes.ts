import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole, requireShop } from '../../middleware/auth.js';
import { ApiError, ok } from '../../utils/api.js';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

inventoryRouter.get('/:shopId', requireShop, async (req, res, next) => {
  try { ok(res, await prisma.inventoryItem.findMany({ where: { shopId: req.params.shopId }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 10 } }, orderBy: { name: 'asc' } })); }
  catch (error) { next(error); }
});

const adjustmentSchema = z.object({ quantity: z.string().regex(/^\d+(\.\d{1,3})?$/), type: z.enum(['ADDITION', 'USAGE', 'ADJUSTMENT', 'WASTAGE']), note: z.string().max(300).optional() });

inventoryRouter.post('/:shopId/items/:itemId/adjust', requireRole('MANAGER', 'KITCHEN_STAFF'), requireShop, async (req, res, next) => {
  try {
    const input = adjustmentSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { id: req.params.itemId, shopId: req.params.shopId } });
      if (!item) throw new ApiError(404, 'Inventory item not found', 'ITEM_NOT_FOUND');
      const delta = input.type === 'ADDITION' ? Number(input.quantity) : -Number(input.quantity);
      if (input.type === 'ADJUSTMENT') {
        throw new ApiError(400, 'Use a signed adjustment workflow with a separate verification record', 'ADJUSTMENT_PENDING_APPROVAL');
      }
      const balance = Number(item.quantity) + delta;
      if (balance < 0) throw new ApiError(409, 'Adjustment would create negative stock', 'NEGATIVE_STOCK');
      const updated = await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: balance.toFixed(3) } });
      await tx.inventoryTransaction.create({ data: { itemId: item.id, userId: req.auth!.userId, type: input.type, quantity: input.quantity, balanceAfter: balance.toFixed(3), note: input.note } });
      await tx.outboxEvent.create({ data: { type: 'inventory.updated', payload: { shopId: req.params.shopId, itemId: item.id, quantity: balance.toFixed(3) } } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'INVENTORY_ADJUSTED', resourceType: 'inventory_item', resourceId: item.id, requestId: String(req.headers['x-request-id']), beforeJson: { quantity: item.quantity.toString() }, afterJson: { quantity: balance.toFixed(3), type: input.type } } });
      return updated;
    });
    ok(res, result);
  } catch (error) { next(error); }
});

inventoryRouter.post('/:shopId/open', requireRole('MANAGER', 'KITCHEN_STAFF', 'WAITER', 'CASHIER'), requireShop, async (req, res, next) => {
  try {
    await prisma.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'SHOP_OPEN_REQUESTED', resourceType: 'shop', resourceId: req.params.shopId, requestId: String(req.headers['x-request-id']) } });
    await prisma.shop.update({ where: { id: req.params.shopId }, data: { isOpen: true } });
    await prisma.outboxEvent.create({ data: { type: 'shop.status.changed', payload: { shopId: req.params.shopId, isOpen: true } } });
    ok(res, { isOpen: true });
  } catch (error) { next(error); }
});

inventoryRouter.post('/:shopId/close', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const unresolved = await prisma.order.count({ where: { shopId: req.params.shopId, status: { in: ['SUBMITTED', 'ACCEPTED', 'PREPARING', 'PARTIALLY_READY', 'READY', 'SERVED', 'AWAITING_PAYMENT'] } } });
    if (unresolved > 0) throw new ApiError(409, 'Cannot close while unresolved orders remain', 'UNRESOLVED_ORDERS');
    await prisma.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'SHOP_CLOSED', resourceType: 'shop', resourceId: req.params.shopId, requestId: String(req.headers['x-request-id']) } });
    await prisma.shop.update({ where: { id: req.params.shopId }, data: { isOpen: false } });
    await prisma.outboxEvent.create({ data: { type: 'shop.status.changed', payload: { shopId: req.params.shopId, isOpen: false } } });
    ok(res, { isOpen: false });
  } catch (error) { next(error); }
});
