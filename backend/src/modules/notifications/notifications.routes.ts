import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth, requireShop } from '../../middleware/auth.js';
import { ok } from '../../utils/api.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/:shopId', requireShop, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const take = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const unreadOnly = req.query.unread === 'true';
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const where: any = { shopId: req.params.shopId, ...(unreadOnly ? { read: false } : {}), ...(type ? { type } : {}), OR: [{ userId: null }, { userId: req.auth!.userId }] };
    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { shopId: req.params.shopId, read: false, OR: [{ userId: null }, { userId: req.auth!.userId }] } }),
    ]);
    ok(res, { items, unread, pagination: { page, limit: take, total, pages: Math.ceil(total / take) } });
  } catch (error) { next(error); }
});

notificationsRouter.post('/:shopId/:notificationId/read', requireShop, async (req, res, next) => {
  try {
    const notification = await prisma.notification.findFirst({ where: { id: req.params.notificationId, shopId: req.params.shopId, OR: [{ userId: null }, { userId: req.auth!.userId }] } });
    if (!notification) { ok(res, { read: false }); return; }
    ok(res, await prisma.notification.update({ where: { id: notification.id }, data: { read: true, readAt: new Date() } }));
  } catch (error) { next(error); }
});

notificationsRouter.post('/:shopId/read-all', requireShop, async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({ where: { shopId: req.params.shopId, read: false, OR: [{ userId: null }, { userId: req.auth!.userId }] }, data: { read: true, readAt: new Date() } });
    ok(res, { updated: result.count });
  } catch (error) { next(error); }
});

notificationsRouter.post('/:shopId', requireShop, async (req, res, next) => {
  try {
    const input = z.object({ type: z.string().min(1).max(80), title: z.string().min(1).max(160), body: z.string().min(1).max(1000), userId: z.string().optional(), deepLink: z.string().max(300).optional() }).parse(req.body);
    if (req.auth!.role !== 'MANAGER' && req.auth!.role !== 'ADMIN') {
      // Operational notifications are server-generated; user-facing clients cannot broadcast arbitrary notifications.
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN_ROLE', message: 'Only managers may create notifications' } });
    }
    ok(res, await prisma.notification.create({ data: { shopId: req.params.shopId, type: input.type, title: input.title, body: input.body, userId: input.userId, deepLink: input.deepLink } }), 201);
  } catch (error) { next(error); }
});
