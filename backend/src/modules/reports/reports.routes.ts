import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole, requireShop } from '../../middleware/auth.js';
import { ok } from '../../utils/api.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole('MANAGER'), requireShop);

reportsRouter.get('/:shopId/sales', async (req, res, next) => {
  try {
    const start = typeof req.query.start === 'string' ? new Date(req.query.start) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = typeof req.query.end === 'string' ? new Date(req.query.end) : new Date();
    const [orders, paymentMethods, typeBreakdown] = await Promise.all([
      prisma.order.findMany({ where: { shopId: req.params.shopId, createdAt: { gte: start, lte: end } }, select: { id: true, status: true, type: true, total: true, createdAt: true } }),
      prisma.payment.groupBy({ by: ['methodCode'], where: { shopId: req.params.shopId, status: 'SUCCEEDED', createdAt: { gte: start, lte: end } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.order.groupBy({ by: ['type'], where: { shopId: req.params.shopId, createdAt: { gte: start, lte: end } }, _count: { _all: true } }),
    ]);
    const completed = orders.filter((order) => order.status === 'PAID' || order.status === 'COMPLETED');
    const revenue = completed.reduce((sum, order) => sum + Number(order.total), 0);
    ok(res, { revenue: revenue.toFixed(2), orderCount: orders.length, averageOrderValue: completed.length ? (revenue / completed.length).toFixed(2) : '0.00', paymentMethods, typeBreakdown });
  } catch (error) { next(error); }
});

reportsRouter.get('/:shopId/tasks', async (req, res, next) => {
  try {
    const [tasks, completed, overdue] = await Promise.all([
      prisma.taskAssignment.count({ where: { shopId: req.params.shopId } }),
      prisma.taskAssignment.count({ where: { shopId: req.params.shopId, status: 'COMPLETED' } }),
      prisma.taskAssignment.count({ where: { shopId: req.params.shopId, status: 'OVERDUE' } }),
    ]);
    ok(res, { assigned: tasks, completed, overdue, completionPercentage: tasks ? Number(((completed / tasks) * 100).toFixed(2)) : 0 });
  } catch (error) { next(error); }
});

reportsRouter.get('/:shopId/inventory', async (req, res, next) => {
  try {
    const [items, transactions, lowStock] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { shopId: req.params.shopId }, select: { id: true, name: true, unit: true, quantity: true, minimum: true } }),
      prisma.inventoryTransaction.findMany({ where: { item: { shopId: req.params.shopId } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.inventoryItem.findMany({ where: { shopId: req.params.shopId }, select: { id: true, name: true, quantity: true, minimum: true } }),
    ]);
    ok(res, { items, transactions, lowStock: lowStock.filter((item) => Number(item.quantity) < Number(item.minimum)) });
  } catch (error) { next(error); }
});

reportsRouter.get('/:shopId/kitchen', async (req, res, next) => {
  try {
    const tickets = await prisma.kitchenTicket.findMany({ where: { shopId: req.params.shopId }, include: { items: true, order: { select: { createdAt: true, status: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
    const elapsedMinutes = tickets.map((ticket) => (Date.now() - ticket.createdAt.getTime()) / 60000);
    ok(res, { ticketCount: tickets.length, delayedTickets: elapsedMinutes.filter((elapsed) => elapsed > 30).length, averageAgeMinutes: tickets.length ? Number((elapsedMinutes.reduce((sum, value) => sum + value, 0) / tickets.length).toFixed(2)) : 0, items: tickets.flatMap((ticket) => ticket.items).slice(0, 100) });
  } catch (error) { next(error); }
});
