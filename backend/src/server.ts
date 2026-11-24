import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/database.js';
import { initializeSockets } from './sockets/index.js';
import { generateRecurringTasks } from './jobs/recurringTasks.js';
import { processPrintQueue } from './jobs/printWorker.js';

const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: env.CORS_ORIGIN.split(',').map((value) => value.trim()), credentials: true } });
initializeSockets(io);

server.listen(env.PORT, () => logger.info({ port: env.PORT }, 'Restaurant management API listening'));

const recurringTimer = setInterval(() => { void generateRecurringTasks().catch((error) => logger.error({ error }, 'Recurring task generation failed')); }, 60 * 60 * 1000);
const printTimer = setInterval(() => { void processPrintQueue().catch((error) => logger.error({ error }, 'Print queue processing failed')); }, 15 * 1000);
const outboxTimer = setInterval(async () => {
  try {
    const events = await prisma.outboxEvent.findMany({ where: { processedAt: null, attempts: { lt: 10 } }, take: 50, orderBy: { createdAt: 'asc' } });
    for (const event of events) {
      const payload = event.payload as { shopId?: string };
      if (payload.shopId) io.to(`shop:${payload.shopId}`).emit(event.type, payload);
      await prisma.outboxEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), attempts: { increment: 1 } } });
    }
  } catch (error) { logger.error({ error }, 'Outbox delivery failed'); }
}, 5 * 1000);

async function shutdown(signal: string) {
  logger.info({ signal }, 'Graceful shutdown started');
  clearInterval(recurringTimer);
  clearInterval(printTimer);
  clearInterval(outboxTimer);
  server.close(async () => { await io.close(); await prisma.$disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
