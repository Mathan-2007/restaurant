import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole, requireShop } from '../../middleware/auth.js';
import { ApiError, ok } from '../../utils/api.js';
import PDFDocument from 'pdfkit';

export const operationsRouter = Router();
operationsRouter.use(requireAuth);

const reservationSchema = z.object({ tableId: z.string().min(1), customerName: z.string().trim().min(2).max(100), phone: z.string().trim().max(20).optional(), partySize: z.number().int().min(1).max(40), reservedAt: z.coerce.date(), notes: z.string().max(500).optional() });
operationsRouter.post('/:shopId/reservations', requireRole('MANAGER', 'WAITER'), requireShop, async (req, res, next) => {
  try {
    const input = reservationSchema.parse(req.body);
    const table = await prisma.restaurantTable.findFirst({ where: { id: input.tableId, shopId: req.params.shopId, active: true } });
    if (!table) throw new ApiError(404, 'Table not found', 'TABLE_NOT_FOUND');
    const conflict = await prisma.tableReservation.findFirst({ where: { shopId: req.params.shopId, tableId: table.id, status: 'RESERVED', reservedAt: { gte: new Date(input.reservedAt.getTime() - 90 * 60000), lte: new Date(input.reservedAt.getTime() + 90 * 60000) } } });
    if (conflict) throw new ApiError(409, 'Table is reserved for that period', 'TABLE_RESERVED');
    const reservation = await prisma.$transaction(async (tx) => {
      const value = await tx.tableReservation.create({ data: { shopId: req.params.shopId, tableId: table.id, customerName: input.customerName, phone: input.phone, partySize: input.partySize, reservedAt: input.reservedAt, notes: input.notes, createdById: req.auth!.userId } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TABLE_RESERVED', resourceType: 'reservation', resourceId: value.id, requestId: String(req.headers['x-request-id']), afterJson: input } });
      return value;
    });
    ok(res, reservation, 201);
  } catch (error) { next(error); }
});
operationsRouter.get('/:shopId/reservations', requireShop, async (req, res, next) => {
  try { ok(res, await prisma.tableReservation.findMany({ where: { shopId: req.params.shopId }, orderBy: { reservedAt: 'asc' } })); } catch (error) { next(error); }
});
operationsRouter.post('/:shopId/reservations/:reservationId/status', requireRole('MANAGER', 'WAITER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(['RESERVED', 'SEATED', 'CANCELLED', 'NO_SHOW']) }).parse(req.body);
    const reservation = await prisma.tableReservation.findFirst({ where: { id: req.params.reservationId, shopId: req.params.shopId } });
    if (!reservation) throw new ApiError(404, 'Reservation not found', 'RESERVATION_NOT_FOUND');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.tableReservation.update({ where: { id: reservation.id }, data: { status: input.status } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'RESERVATION_STATUS_UPDATED', resourceType: 'reservation', resourceId: reservation.id, requestId: String(req.headers['x-request-id']), beforeJson: reservation, afterJson: input } });
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

operationsRouter.post('/:shopId/waiting', requireRole('MANAGER', 'WAITER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ customerName: z.string().trim().max(100).optional(), phone: z.string().trim().max(20).optional(), partySize: z.number().int().min(1).max(40) }).parse(req.body);
    const entry = await prisma.waitingQueueEntry.create({ data: { shopId: req.params.shopId, customerName: input.customerName, phone: input.phone, partySize: input.partySize, createdById: req.auth!.userId } });
    ok(res, entry, 201);
  } catch (error) { next(error); }
});
operationsRouter.get('/:shopId/waiting', requireRole('MANAGER', 'WAITER'), requireShop, async (req, res, next) => {
  try { ok(res, await prisma.waitingQueueEntry.findMany({ where: { shopId: req.params.shopId, status: { in: ['WAITING', 'CALLED'] } }, orderBy: { createdAt: 'asc' } })); } catch (error) { next(error); }
});
operationsRouter.post('/:shopId/waiting/:entryId/status', requireRole('MANAGER', 'WAITER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(['WAITING', 'CALLED', 'SEATED', 'CANCELLED']), tableId: z.string().optional() }).parse(req.body);
    const entry = await prisma.waitingQueueEntry.findFirst({ where: { id: req.params.entryId, shopId: req.params.shopId } });
    if (!entry) throw new ApiError(404, 'Queue entry not found', 'QUEUE_ENTRY_NOT_FOUND');
    const updated = await prisma.waitingQueueEntry.update({ where: { id: entry.id }, data: { status: input.status, seatedTableId: input.tableId, calledAt: input.status === 'CALLED' ? new Date() : entry.calledAt, seatedAt: input.status === 'SEATED' ? new Date() : entry.seatedAt } });
    ok(res, updated);
  } catch (error) { next(error); }
});

operationsRouter.post('/:shopId/tables/:tableId/transfer', requireRole('MANAGER', 'WAITER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ targetTableId: z.string().min(1), orderId: z.string().min(1) }).parse(req.body);
    const [source, target, order] = await Promise.all([
      prisma.restaurantTable.findFirst({ where: { id: req.params.tableId, shopId: req.params.shopId, active: true } }),
      prisma.restaurantTable.findFirst({ where: { id: input.targetTableId, shopId: req.params.shopId, active: true } }),
      prisma.order.findFirst({ where: { id: input.orderId, shopId: req.params.shopId } }),
    ]);
    if (!source || !target) throw new ApiError(404, 'Eligible table not found', 'TABLE_NOT_FOUND');
    if (!order) throw new ApiError(404, 'Order not found', 'ORDER_NOT_FOUND');
    if (['PAID', 'COMPLETED', 'CANCELLED'].includes(order.status)) throw new ApiError(409, 'Resolved orders cannot be transferred', 'ORDER_RESOLVED');
    const targetSession = await prisma.tableSession.findFirst({ where: { tableId: target.id, active: true } });
    const sourceSession = await prisma.tableSession.findFirst({ where: { tableId: source.id, active: true } });
    await prisma.$transaction(async (tx) => {
      let session = targetSession;
      if (!session) session = await tx.tableSession.create({ data: { tableId: target.id } });
      await tx.order.update({ where: { id: order.id }, data: { tableSessionId: session.id, version: { increment: 1 } } });
      await tx.restaurantTable.update({ where: { id: target.id }, data: { status: 'ORDER_IN_PROGRESS' } });
      await tx.restaurantTable.update({ where: { id: source.id }, data: { status: 'CLEANING' } });
      if (sourceSession) {
        const remaining = await tx.order.count({ where: { tableSessionId: sourceSession.id, status: { notIn: ['PAID', 'COMPLETED', 'CANCELLED'] } } });
        if (remaining === 0) await tx.tableSession.update({ where: { id: sourceSession.id }, data: { active: false, closedAt: new Date() } });
      }
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TABLE_ORDER_TRANSFERRED', resourceType: 'order', resourceId: order.id, requestId: String(req.headers['x-request-id']), beforeJson: { sourceTableId: source.id }, afterJson: { targetTableId: target.id } } });
    });
    ok(res, { transferred: true });
  } catch (error) { next(error); }
});

const evidenceUpload = multer({
  dest: path.resolve(process.cwd(), 'uploads/private'),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

operationsRouter.post('/:shopId/tasks/:taskId/photo', requireShop, evidenceUpload.array('photos', 10), async (req, res, next) => {
  try {
    const task = await prisma.taskAssignment.findFirst({ where: { id: req.params.taskId, shopId: req.params.shopId, members: { some: { userId: req.auth!.userId } } } });
    if (!task) throw new ApiError(404, 'Task not found or not assigned', 'TASK_NOT_FOUND');
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) throw new ApiError(400, 'At least one valid image is required', 'PHOTO_REQUIRED');
    const records = await prisma.$transaction(async (tx) => {
      const values = await Promise.all(files.map((file) => tx.taskPhotoEvidence.create({ data: { assignmentId: task.id, userId: req.auth!.userId, fileName: path.basename(file.path), mimeType: file.mimetype, fileSize: file.size, storagePath: file.path } })));
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TASK_PHOTO_UPLOADED', resourceType: 'task', resourceId: task.id, requestId: String(req.headers['x-request-id']), afterJson: { count: files.length } } });
      return values;
    });
    ok(res, { uploaded: records.length }, 201);
  } catch (error) { next(error); }
});

operationsRouter.post('/:shopId/preparation', requireRole('MANAGER', 'KITCHEN_STAFF'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ menuItemId: z.string().min(1), planned: z.string().regex(/^\d+(\.\d{1,3})?$/), actual: z.string().regex(/^\d+(\.\d{1,3})?$/), wasted: z.string().regex(/^\d+(\.\d{1,3})?$/).default('0'), startedAt: z.coerce.date().optional(), completedAt: z.coerce.date().optional(), notes: z.string().max(1000).optional() }).parse(req.body);
    const record = await prisma.$transaction(async (tx) => {
      const value = await tx.foodPreparationRecord.create({ data: { shopId: req.params.shopId, menuItemId: input.menuItemId, planned: input.planned, actual: input.actual, wasted: input.wasted, startedAt: input.startedAt, completedAt: input.completedAt, notes: input.notes } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'FOOD_PREPARATION_RECORDED', resourceType: 'food_preparation', resourceId: value.id, requestId: String(req.headers['x-request-id']), afterJson: input } });
      return value;
    });
    ok(res, record, 201);
  } catch (error) { next(error); }
});

operationsRouter.post('/:shopId/remaining-food', requireRole('MANAGER', 'KITCHEN_STAFF', 'WAITER', 'CASHIER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ menuItemId: z.string().min(1), prepared: z.string().regex(/^\d+(\.\d{1,3})?$/), sold: z.string().regex(/^\d+(\.\d{1,3})?$/), wasted: z.string().regex(/^\d+(\.\d{1,3})?$/), actual: z.string().regex(/^\d+(\.\d{1,3})?$/) }).parse(req.body);
    const expected = Number(input.prepared) - Number(input.sold) - Number(input.wasted);
    const discrepancy = Number(input.actual) - expected;
    const record = await prisma.$transaction(async (tx) => {
      const value = await tx.remainingFoodRecord.create({ data: { shopId: req.params.shopId, menuItemId: input.menuItemId, expected: expected.toFixed(3), actual: input.actual, discrepancy: discrepancy.toFixed(3), recordedById: req.auth!.userId } });
      await tx.notification.create({ data: { shopId: req.params.shopId, type: 'FOOD_QUANTITY_DISCREPANCY', title: 'Remaining food discrepancy', body: `Recorded discrepancy: ${discrepancy.toFixed(3)} portions/units`, deepLink: '/manager/inventory' } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'REMAINING_FOOD_VERIFIED', resourceType: 'remaining_food', resourceId: value.id, requestId: String(req.headers['x-request-id']), afterJson: { ...input, expected, discrepancy } } });
      return value;
    });
    ok(res, record, 201);
  } catch (error) { next(error); }
});

operationsRouter.post('/:shopId/cashier-sessions/open', requireRole('CASHIER', 'MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ openingBalance: z.string().regex(/^\d+(\.\d{1,2})?$/) }).parse(req.body);
    const open = await prisma.cashierSession.findFirst({ where: { shopId: req.params.shopId, cashierId: req.auth!.userId, status: 'OPEN' } });
    if (open) throw new ApiError(409, 'A cashier session is already open', 'CASHIER_SESSION_OPEN');
    const session = await prisma.$transaction(async (tx) => {
      const value = await tx.cashierSession.create({ data: { shopId: req.params.shopId, cashierId: req.auth!.userId, openingBalance: input.openingBalance } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'CASHIER_SESSION_OPENED', resourceType: 'cashier_session', resourceId: value.id, requestId: String(req.headers['x-request-id']), afterJson: input } });
      return value;
    });
    ok(res, session, 201);
  } catch (error) { next(error); }
});

operationsRouter.post('/:shopId/cashier-sessions/close', requireRole('CASHIER', 'MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ actualClosingBalance: z.string().regex(/^\d+(\.\d{1,2})?$/), closingNotes: z.string().max(500).optional() }).parse(req.body);
    const open = await prisma.cashierSession.findFirst({ where: { shopId: req.params.shopId, cashierId: req.auth!.userId, status: 'OPEN' } });
    if (!open) throw new ApiError(404, 'No open cashier session', 'CASHIER_SESSION_NOT_FOUND');
    const cashPayments = await prisma.payment.findMany({ where: { shopId: req.params.shopId, methodCode: 'CASH', status: 'SUCCEEDED', confirmedById: req.auth!.userId, createdAt: { gte: open.openedAt } }, select: { amount: true } });
    const collections = cashPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const expected = Number(open.openingBalance) + collections;
    const actual = Number(input.actualClosingBalance);
    const difference = actual - expected;
    const closed = await prisma.$transaction(async (tx) => {
      const value = await tx.cashierSession.update({ where: { id: open.id }, data: { status: 'CLOSED', actualClosingBalance: actual.toFixed(2), expectedClosingBalance: expected.toFixed(2), difference: difference.toFixed(2), closingNotes: input.closingNotes, closedAt: new Date() } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'CASHIER_SESSION_CLOSED', resourceType: 'cashier_session', resourceId: value.id, requestId: String(req.headers['x-request-id']), afterJson: { expected, actual, difference } } });
      return value;
    });
    ok(res, closed);
  } catch (error) { next(error); }
});

operationsRouter.get('/:shopId/cashier-sessions', requireRole('CASHIER', 'MANAGER'), requireShop, async (req, res, next) => {
  try { ok(res, await prisma.cashierSession.findMany({ where: { shopId: req.params.shopId }, orderBy: { openedAt: 'desc' }, take: 100 })); } catch (error) { next(error); }
});

operationsRouter.post('/:shopId/payments/:paymentId/split', requireRole('CASHIER', 'MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ parts: z.array(z.object({ methodCode: z.string().min(1).max(40), amount: z.string().regex(/^\d+(\.\d{1,2})?$/), reference: z.string().max(200).optional() })).min(2).max(10) }).parse(req.body);
    const payment = await prisma.payment.findFirst({ where: { id: req.params.paymentId, shopId: req.params.shopId } });
    if (!payment) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    const total = input.parts.reduce((sum, part) => sum + Number(part.amount), 0);
    if (Math.abs(total - Number(payment.amount)) > 0.001) throw new ApiError(400, 'Split amounts must equal the payment amount', 'INVALID_SPLIT_TOTAL');
    await prisma.$transaction(async (tx) => {
      await tx.splitPayment.createMany({ data: input.parts.map((part) => ({ paymentId: payment.id, methodCode: part.methodCode, amount: part.amount, reference: part.reference })) });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'PAYMENT_SPLIT_RECORDED', resourceType: 'payment', resourceId: payment.id, requestId: String(req.headers['x-request-id']), afterJson: input } });
    });
    ok(res, { recorded: true });
  } catch (error) { next(error); }
});

operationsRouter.post('/:shopId/refunds/:paymentId/request', requireRole('CASHIER', 'MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ amount: z.string().regex(/^\d+(\.\d{1,2})?$/), reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const payment = await prisma.payment.findFirst({ where: { id: req.params.paymentId, shopId: req.params.shopId } });
    if (!payment) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    if (Number(input.amount) > Number(payment.amount)) throw new ApiError(400, 'Refund exceeds payment amount', 'REFUND_TOO_LARGE');
    const refund = await prisma.$transaction(async (tx) => {
      const value = await tx.refund.create({ data: { shopId: req.params.shopId, paymentId: payment.id, amount: input.amount, reason: input.reason } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'REFUND_REQUESTED', resourceType: 'refund', resourceId: value.id, requestId: String(req.headers['x-request-id']), afterJson: input } });
      return value;
    });
    ok(res, refund, 201);
  } catch (error) { next(error); }
});

operationsRouter.post('/:shopId/refunds/:refundId/approve', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) }).parse(req.body);
    const refund = await prisma.refund.findFirst({ where: { id: req.params.refundId, shopId: req.params.shopId } });
    if (!refund) throw new ApiError(404, 'Refund not found', 'REFUND_NOT_FOUND');
    if (refund.status !== 'PENDING') throw new ApiError(409, 'Refund already reviewed', 'REFUND_ALREADY_REVIEWED');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.refund.update({ where: { id: refund.id }, data: { status: input.decision, approvedById: req.auth!.userId } });
      if (input.decision === 'APPROVED') await tx.payment.update({ where: { id: refund.paymentId }, data: { status: 'REFUNDED' } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: input.decision === 'APPROVED' ? 'REFUND_APPROVED' : 'REFUND_REJECTED', resourceType: 'refund', resourceId: refund.id, requestId: String(req.headers['x-request-id']), beforeJson: refund, afterJson: input } });
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

operationsRouter.get('/:shopId/tasks/:taskId/photos/:photoId', requireShop, async (req, res, next) => {
  try {
    const photo = await prisma.taskPhotoEvidence.findFirst({ where: { id: req.params.photoId, assignment: { shopId: req.params.shopId } } });
    if (!photo) throw new ApiError(404, 'Photo not found', 'PHOTO_NOT_FOUND');
    res.type(photo.mimeType);
    res.sendFile(path.resolve(photo.storagePath));
  } catch (error) { next(error); }
});

operationsRouter.get('/:shopId/reports/sales.csv', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const start = typeof req.query.start === 'string' ? new Date(req.query.start) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = typeof req.query.end === 'string' ? new Date(req.query.end) : new Date();
    const orders = await prisma.order.findMany({ where: { shopId: req.params.shopId, createdAt: { gte: start, lte: end } }, select: { orderNumber: true, type: true, status: true, total: true, createdAt: true } });
    const csv = ['Order Number,Type,Status,Total,Created At', ...orders.map((order) => [order.orderNumber, order.type, order.status, order.total.toString(), order.createdAt.toISOString()].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sales.csv"');
    res.send(csv);
  } catch (error) { next(error); }
});
operationsRouter.get('/:shopId/invoices/:invoiceId/pdf', requireRole('CASHIER', 'MANAGER'), requireShop, async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({ where: { id: req.params.invoiceId, shopId: req.params.shopId }, include: { order: { include: { items: true } } } });
    if (!invoice) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    const document = new PDFDocument({ margin: 48 });
    document.pipe(res);
    document.fontSize(18).text('RESTAURANT INVOICE', { align: 'center' });
    document.moveDown();
    document.fontSize(12).text(`Invoice: ${invoice.invoiceNumber}`);
    document.text(`Order: ${invoice.order.orderNumber}`);
    document.text(`Date: ${invoice.createdAt.toISOString()}`);
    document.moveDown();
    invoice.order.items.forEach((item) => document.text(`${item.quantity} x ${item.nameSnapshot}  ₹${item.lineTotal}`));
    document.moveDown();
    document.text(`Subtotal: ₹${invoice.subtotal}`);
    document.text(`Tax: ₹${invoice.tax}`);
    document.text(`Discount: ₹${invoice.discount}`);
    document.fontSize(14).text(`Total: ₹${invoice.total}`);
    document.end();
  } catch (error) { next(error); }
});
