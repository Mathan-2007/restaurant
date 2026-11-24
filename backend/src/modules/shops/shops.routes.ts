import { Router } from 'express';
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
  try { ok(res, await prisma.restaurantTable.findMany({ where: { shopId: req.params.shopId }, orderBy: { number: 'asc' } })); }
  catch (error) { next(error); }
});
