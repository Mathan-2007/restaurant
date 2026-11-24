import express from 'express';
import type { CorsOptions } from 'cors';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/database.js';
import { requestContext } from './middleware/request.js';
import { errorHandler } from './middleware/error.js';
import { csrfProtect } from './middleware/csrf.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { shopsRouter } from './modules/shops/shops.routes.js';
import { menuRouter } from './modules/menu/menu.routes.js';
import { tasksRouter } from './modules/tasks/tasks.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { kitchenRouter } from './modules/kitchen/kitchen.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { employeesRouter } from './modules/employees/employees.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { operationsRouter } from './modules/operations/operations.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';

export const app = express();
const allowedOrigins = env.CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean);
const corsOptions: CorsOptions = {
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Origin is not allowed by CORS'));
  },
};

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => logger.info({ method: req.method, path: req.path, statusCode: res.statusCode, requestId: req.headers['x-request-id'], durationMs: Date.now() - started }, 'HTTP request completed'));
  next();
});
app.use(requestContext);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.get('/health', async (_req, res, next) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ success: true, data: { status: 'healthy', database: 'ready', timestamp: new Date().toISOString() } }); }
  catch (error) { next(error); }
});

app.use('/api/auth', csrfProtect, authRouter);
app.use('/api/shops', csrfProtect, shopsRouter);
app.use('/api/employees', csrfProtect, employeesRouter);
app.use('/api/menu', csrfProtect, menuRouter);
app.use('/api/tasks', csrfProtect, tasksRouter);
app.use('/api/orders', csrfProtect, ordersRouter);
app.use('/api/kitchen', csrfProtect, kitchenRouter);
app.use('/api/payments', csrfProtect, paymentsRouter);
app.use('/api/inventory', csrfProtect, inventoryRouter);
app.use('/api/notifications', csrfProtect, notificationsRouter);
app.use('/api/reports', csrfProtect, reportsRouter);
app.use('/api/operations', csrfProtect, operationsRouter);
app.use('/api/admin', csrfProtect, adminRouter);
app.use(errorHandler);
