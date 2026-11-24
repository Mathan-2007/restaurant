import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole, requireShop } from '../../middleware/auth.js';
import { ApiError, ok } from '../../utils/api.js';

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

paymentsRouter.post('/:shopId/:orderId/request', requireRole('WAITER'), requireShop, async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params.orderId, shopId: req.params.shopId } });
    if (!order) throw new ApiError(404, 'Order not found', 'ORDER_NOT_FOUND');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.order.update({ where: { id: order.id }, data: { status: 'AWAITING_PAYMENT' } });
      await tx.outboxEvent.create({ data: { type: 'payment.requested', payload: { shopId: req.params.shopId, orderId: order.id } } });
      await tx.notification.create({ data: { shopId: req.params.shopId, type: 'PAYMENT_REQUESTED', title: 'Payment requested', body: `Order ${order.orderNumber} is awaiting payment` } });
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

const paymentSchema = z.object({ methodCode: z.enum(['CASH', 'UPI', 'CARD', 'OTHER']), receivedAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), reference: z.string().max(200).optional(), splitPayments: z.array(z.object({ methodCode: z.string(), amount: z.string().regex(/^\d+(\.\d{1,2})?$/) })).optional() });

paymentsRouter.post('/:shopId/:orderId/pay', requireRole('CASHIER', 'MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = paymentSchema.parse(req.body);
    const idem = req.headers['idempotency-key'];
    if (typeof idem !== 'string' || idem.length < 8) throw new ApiError(400, 'An idempotency key is required', 'IDEMPOTENCY_REQUIRED');
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: idem } });
    if (existing) { ok(res, existing); return; }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: req.params.orderId, shopId: req.params.shopId } });
      if (!order) throw new ApiError(404, 'Order not found', 'ORDER_NOT_FOUND');
      if (['PAID', 'COMPLETED'].includes(order.status)) throw new ApiError(409, 'Payment has already been completed', 'PAYMENT_DUPLICATE');
      if (input.methodCode === 'CASH' && input.receivedAmount) {
        if (Number(input.receivedAmount) < Number(order.total)) throw new ApiError(400, 'Received amount is less than the order total', 'CASH_INSUFFICIENT');
      }
      const count = await tx.invoice.count({ where: { shopId: req.params.shopId } });
      const invoice = await tx.invoice.create({ data: { shopId: req.params.shopId, orderId: order.id, invoiceNumber: `INV-${req.params.shopId.slice(-6).toUpperCase()}-${String(count + 1).padStart(8, '0')}`, subtotal: order.subtotal, tax: order.tax, discount: '0.00', total: order.total } });
      const payment = await tx.payment.create({ data: { shopId: req.params.shopId, orderId: order.id, amount: order.total, status: 'SUCCEEDED', methodCode: input.methodCode, reference: input.reference, idempotencyKey: idem, confirmedById: req.auth!.userId } });
      await tx.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
      await tx.orderStatusHistory.create({ data: { orderId: order.id, status: 'PAID', changedById: req.auth!.userId } });
      await tx.outboxEvent.create({ data: { type: 'payment.completed', payload: { shopId: req.params.shopId, orderId: order.id, invoiceId: invoice.id, paymentId: payment.id } } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'PAYMENT_CONFIRMED', resourceType: 'payment', resourceId: payment.id, requestId: String(req.headers['x-request-id']), afterJson: { amount: payment.amount.toString(), method: payment.methodCode } } });
      return { invoice, payment, change: input.methodCode === 'CASH' && input.receivedAmount ? (Number(input.receivedAmount) - Number(order.total)).toFixed(2) : null };
    });
    ok(res, result);
  } catch (error) { next(error); }
});

paymentsRouter.get('/:shopId/invoices', requireRole('CASHIER', 'MANAGER'), requireShop, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const take = Math.min(50, Number(req.query.limit ?? 20));
    const where = { shopId: req.params.shopId };
    const [items, total] = await Promise.all([prisma.invoice.findMany({ where, include: { order: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take }), prisma.invoice.count({ where })]);
    ok(res, { items, pagination: { page, limit: take, total, pages: Math.ceil(total / take) } });
  } catch (error) { next(error); }
});
