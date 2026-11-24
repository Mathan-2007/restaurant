import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole, requireShop } from '../../middleware/auth.js';
import { ApiError, ok } from '../../utils/api.js';

export const menuRouter = Router();
menuRouter.use(requireAuth);

menuRouter.get('/:shopId', requireShop, async (req, res, next) => {
  try {
    const categories = await prisma.menuCategory.findMany({
      where: { shopId: req.params.shopId, active: true },
      include: { items: { where: { active: true }, include: { variants: true, addons: true, availabilities: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    ok(res, categories);
  } catch (error) { next(error); }
});

const itemSchema = z.object({ categoryId: z.string().min(1), name: z.string().trim().min(2).max(120), description: z.string().max(500).optional(), price: z.string().regex(/^\d+(\.\d{1,2})?$/), active: z.boolean().optional(), soldOut: z.boolean().optional() });

menuRouter.post('/:shopId/items', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = itemSchema.parse(req.body);
    const category = await prisma.menuCategory.findFirst({ where: { id: input.categoryId, shopId: req.params.shopId } });
    if (!category) throw new ApiError(404, 'Menu category not found in this shop', 'CATEGORY_NOT_FOUND');
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.menuItem.create({ data: { categoryId: category.id, name: input.name, description: input.description, price: input.price, active: input.active ?? true, soldOut: input.soldOut ?? false } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'MENU_ITEM_CREATED', resourceType: 'menu_item', resourceId: created.id, requestId: String(req.headers['x-request-id']), afterJson: input } });
      return created;
    });
    ok(res, item, 201);
  } catch (error) { next(error); }
});

const updateSchema = itemSchema.partial().omit({ categoryId: true });
menuRouter.patch('/:shopId/items/:itemId', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    const item = await prisma.menuItem.findFirst({ where: { id: req.params.itemId, category: { shopId: req.params.shopId } } });
    if (!item) throw new ApiError(404, 'Menu item not found', 'ITEM_NOT_FOUND');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.menuItem.update({ where: { id: item.id }, data: input });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'MENU_ITEM_UPDATED', resourceType: 'menu_item', resourceId: item.id, requestId: String(req.headers['x-request-id']), beforeJson: { price: item.price.toString(), name: item.name, soldOut: item.soldOut }, afterJson: input } });
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});
