import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole, requireShop } from '../../middleware/auth.js';
import { ApiError, ok } from '../../utils/api.js';

export const kitchenRouter = Router();
kitchenRouter.use(requireAuth, requireRole('KITCHEN_STAFF', 'MANAGER'));

kitchenRouter.get('/:shopId/tickets', requireShop, async (req, res, next) => {
  try {
    const tickets = await prisma.kitchenTicket.findMany({ where: { shopId: req.params.shopId }, include: { order: { include: { items: true, createdBy: { select: { fullName: true } } } }, items: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    ok(res, tickets);
  } catch (error) { next(error); }
});

kitchenRouter.post('/:shopId/tickets/:ticketId/status', requireShop, async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'CANCELLED']) }).parse(req.body);
    const ticket = await prisma.kitchenTicket.findFirst({ where: { id: req.params.ticketId, shopId: req.params.shopId } });
    if (!ticket) throw new ApiError(404, 'Kitchen ticket not found', 'TICKET_NOT_FOUND');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.kitchenTicket.update({ where: { id: ticket.id }, data: { status: input.status } });
      await tx.order.update({ where: { id: ticket.orderId }, data: { status: input.status === 'READY' ? 'READY' : input.status === 'CANCELLED' ? 'CANCELLED' : input.status === 'PREPARING' ? 'PREPARING' : 'ACCEPTED' } });
      await tx.outboxEvent.create({ data: { type: input.status === 'READY' ? 'kitchen.order.ready' : 'kitchen.ticket.updated', payload: { shopId: req.params.shopId, ticketId: ticket.id, orderId: ticket.orderId, status: input.status } } });
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

kitchenRouter.post('/:shopId/tickets/:ticketId/print', requireShop, async (req, res, next) => {
  try {
    const ticket = await prisma.kitchenTicket.findFirst({ where: { id: req.params.ticketId, shopId: req.params.shopId }, include: { order: { include: { items: true } }, items: true } });
    if (!ticket) throw new ApiError(404, 'Kitchen ticket not found', 'TICKET_NOT_FOUND');
    const printer = await prisma.printer.findFirst({ where: { shopId: req.params.shopId, active: true } });
    if (!printer) throw new ApiError(503, 'No active printer configured; use the development print simulator', 'PRINTER_NOT_CONFIGURED');
    const payload = ticket.revisionNumber > 1
      ? `EDITED KITCHEN ORDER\nOrder: ${ticket.order.orderNumber}\nRevision: ${ticket.revisionNumber}\n${ticket.items.map((item) => `${item.changeType}: ${item.quantity} x ${item.name}`).join('\n')}`
      : `KITCHEN ORDER TICKET\nOrder: ${ticket.order.orderNumber}\nType: ${ticket.order.type}\n${ticket.items.map((item) => `${item.quantity} x ${item.name}`).join('\n')}`;
    const job = await prisma.printJob.create({ data: { shopId: req.params.shopId, printerId: printer.id, ticketId: ticket.id, payload } });
    ok(res, job, 201);
  } catch (error) { next(error); }
});
