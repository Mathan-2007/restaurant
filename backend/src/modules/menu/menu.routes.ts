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

const categorySchema = z.object({ name: z.string().trim().min(2).max(80), sortOrder: z.number().int().min(0).optional(), active: z.boolean().optional() });

menuRouter.post('/:shopId/categories', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = categorySchema.parse(req.body);
    const existing = await prisma.menuCategory.findUnique({ where: { shopId_name: { shopId: req.params.shopId, name: input.name } } });
    if (existing) throw new ApiError(409, 'Category already exists', 'CATEGORY_EXISTS');
    const category = await prisma.$transaction(async (tx) => {
      const value = await tx.menuCategory.create({ data: { shopId: req.params.shopId, name: input.name, sortOrder: input.sortOrder || 0, active: input.active ?? true } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'MENU_CATEGORY_CREATED', resourceType: 'menu_category', resourceId: value.id, requestId: String(req.headers['x-request-id']), afterJson: input } });
      return value;
    });
    ok(res, category, 201);
  } catch (error) { next(error); }
});

menuRouter.patch('/:shopId/categories/:categoryId', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = categorySchema.partial().parse(req.body);
    const category = await prisma.menuCategory.findFirst({ where: { id: req.params.categoryId, shopId: req.params.shopId } });
    if (!category) throw new ApiError(404, 'Category not found', 'CATEGORY_NOT_FOUND');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.menuCategory.update({ where: { id: category.id }, data: input });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'MENU_CATEGORY_UPDATED', resourceType: 'menu_category', resourceId: category.id, requestId: String(req.headers['x-request-id']), beforeJson: category, afterJson: input } });
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

menuRouter.post('/:shopId/items/:itemId/archive', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const item = await prisma.menuItem.findFirst({ where: { id: req.params.itemId, category: { shopId: req.params.shopId } } });
    if (!item) throw new ApiError(404, 'Menu item not found', 'ITEM_NOT_FOUND');
    const archived = await prisma.$transaction(async (tx) => {
      const value = await tx.menuItem.update({ where: { id: item.id }, data: { active: false } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'MENU_ITEM_ARCHIVED', resourceType: 'menu_item', resourceId: item.id, requestId: String(req.headers['x-request-id']), beforeJson: item, afterJson: { active: false } } });
      return value;
    });
    ok(res, archived);
  } catch (error) { next(error); }
});

menuRouter.post('/:shopId/items/:itemId/duplicate', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(2).max(120).optional(), categoryId: z.string().optional() }).parse(req.body);
    const item = await prisma.menuItem.findFirst({ where: { id: req.params.itemId, category: { shopId: req.params.shopId } }, include: { variants: true, addons: true } });
    if (!item) throw new ApiError(404, 'Menu item not found', 'ITEM_NOT_FOUND');
    const categoryId = input.categoryId || item.categoryId;
    const category = await prisma.menuCategory.findFirst({ where: { id: categoryId, shopId: req.params.shopId } });
    if (!category) throw new ApiError(404, 'Category not found', 'CATEGORY_NOT_FOUND');
    const duplicated = await prisma.$transaction(async (tx) => {
      const value = await tx.menuItem.create({ data: { categoryId, name: input.name || `${item.name} Copy`, description: item.description, imageUrl: item.imageUrl, price: item.price, soldOut: false, variants: { create: item.variants.map((variant) => ({ name: variant.name, priceModifier: variant.priceModifier })) }, addons: { create: item.addons.map((addon) => ({ name: addon.name, price: addon.price })) } } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'MENU_ITEM_DUPLICATED', resourceType: 'menu_item', resourceId: value.id, requestId: String(req.headers['x-request-id']), afterJson: { sourceItemId: item.id } } });
      return value;
    });
    ok(res, duplicated, 201);
  } catch (error) { next(error); }
});

menuRouter.post('/:shopId/items/bulk-availability', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ itemIds: z.array(z.string()).min(1).max(500), soldOut: z.boolean(), active: z.boolean().optional() }).parse(req.body);
    const items = await prisma.menuItem.findMany({ where: { id: { in: input.itemIds }, category: { shopId: req.params.shopId } }, select: { id: true } });
    if (items.length !== new Set(input.itemIds).size) throw new ApiError(400, 'One or more menu items are not in this shop', 'ITEM_SHOP_FORBIDDEN');
    await prisma.$transaction(async (tx) => {
      await tx.menuItem.updateMany({ where: { id: { in: input.itemIds } }, data: { soldOut: input.soldOut, ...(input.active !== undefined ? { active: input.active } : {}) } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'MENU_AVAILABILITY_BULK_UPDATED', resourceType: 'menu_items', resourceId: 'bulk', requestId: String(req.headers['x-request-id']), afterJson: input } });
    });
    ok(res, { updated: items.length });
  } catch (error) { next(error); }
});

menuRouter.post('/:shopId/items/:itemId/variants', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(1).max(80), priceModifier: z.string().regex(/^[-]?\d+(\.\d{1,2})?$/) }).parse(req.body);
    const item = await prisma.menuItem.findFirst({ where: { id: req.params.itemId, category: { shopId: req.params.shopId } } });
    if (!item) throw new ApiError(404, 'Menu item not found', 'ITEM_NOT_FOUND');
    ok(res, await prisma.menuItemVariant.create({ data: { itemId: item.id, name: input.name, priceModifier: input.priceModifier } }), 201);
  } catch (error) { next(error); }
});

menuRouter.post('/:shopId/items/:itemId/addons', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(1).max(80), price: z.string().regex(/^\d+(\.\d{1,2})?$/) }).parse(req.body);
    const item = await prisma.menuItem.findFirst({ where: { id: req.params.itemId, category: { shopId: req.params.shopId } } });
    if (!item) throw new ApiError(404, 'Menu item not found', 'ITEM_NOT_FOUND');
    ok(res, await prisma.menuItemAddon.create({ data: { itemId: item.id, name: input.name, price: input.price } }), 201);
  } catch (error) { next(error); }
});
