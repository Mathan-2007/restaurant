import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/database.js';
import { initializeSockets } from './sockets/index.js';

const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: env.CORS_ORIGIN.split(',').map((value) => value.trim()), credentials: true } });
initializeSockets(io);

server.listen(env.PORT, () => logger.info({ port: env.PORT }, 'Restaurant management API listening'));

async function shutdown(signal: string) {
  logger.info({ signal }, 'Graceful shutdown started');
  server.close(async () => { await io.close(); await prisma.$disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
