import type { Server, Socket } from 'socket.io';
import { prisma } from '../config/database.js';

async function authenticatedSocket(socket: Socket) {
  const cookie = socket.handshake.headers.cookie || '';
  const sid = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('sid='))?.slice(4);
  if (!sid) return null;
  return prisma.session.findFirst({ where: { id: sid, revokedAt: null, expiresAt: { gt: new Date() } }, include: { user: { include: { role: true, employeeAssignments: true, managerAssignments: true } } } });
}

export function initializeSockets(io: Server) {
  io.use(async (socket, next) => {
    try { const session = await authenticatedSocket(socket); if (!session || session.user.status !== 'ACTIVE') return next(new Error('Unauthorized')); (socket.data as any).user = session.user; next(); }
    catch { next(new Error('Unauthorized')); }
  });

  io.on('connection', (socket) => {
    socket.on('shop.subscribe', async (payload: { shopId?: string }, acknowledge?: (result: { ok: boolean }) => void) => {
      const shopId = payload?.shopId;
      const user = socket.data.user;
      if (!shopId) { acknowledge?.({ ok: false }); return; }
      const role = user.role.name;
      const authorized = role === 'ADMIN' || (role === 'MANAGER' ? user.managerAssignments.some((a: { shopId: string }) => a.shopId === shopId) : user.employeeAssignments.some((a: { shopId: string }) => a.shopId === shopId));
      if (!authorized) { acknowledge?.({ ok: false }); return; }
      await socket.join(`shop:${shopId}`);
      await socket.join(`role:${role}:shop:${shopId}`);
      acknowledge?.({ ok: true });
    });
  });
}
