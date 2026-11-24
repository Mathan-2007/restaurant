import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { ApiError, ok } from '../../utils/api.js';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

const audit = (req: any, shopId: string | null, action: string, module: string, resourceType: string, resourceId: string, beforeJson?: unknown, afterJson?: unknown, reason?: string) => prisma.auditLog.create({ data: { shopId, actorId: req.auth?.userId, action, module, resourceType, resourceId, requestId: String(req.headers['x-request-id']), ipAddress: req.ip, userAgent: req.get('user-agent')?.slice(0, 500), reason, beforeJson: beforeJson as any, afterJson: afterJson as any } });

adminRouter.get('/dashboard', async (req, res, next) => {
  try {
    const start = typeof req.query.start === 'string' ? new Date(req.query.start) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = typeof req.query.end === 'string' ? new Date(req.query.end) : new Date();
    const shopIds = typeof req.query.branchIds === 'string' ? req.query.branchIds.split(',').filter(Boolean) : undefined;
    const shopFilter = shopIds?.length ? { in: shopIds } : undefined;
    const [shops, users, orders, payments, purchases, expenses, payroll, inventory, tasks, refundRecords, auditCount] = await Promise.all([
      prisma.shop.findMany({ where: { ...(shopIds?.length ? { id: shopFilter } : {}) } }),
      prisma.user.count({ where: { archivedAt: null } }),
      prisma.order.findMany({ where: { ...(shopIds?.length ? { shopId: shopFilter } : {}), createdAt: { gte: start, lte: end } }, select: { id: true, status: true, type: true, total: true } }),
      prisma.payment.findMany({ where: { ...(shopIds?.length ? { shopId: shopFilter } : {}), createdAt: { gte: start, lte: end } }, select: { amount: true, status: true, methodCode: true } }),
      prisma.purchase.findMany({ where: { ...(shopIds?.length ? { shopId: shopFilter } : {}), purchaseDate: { gte: start, lte: end } }, select: { total: true, status: true } }),
      prisma.expense.findMany({ where: { ...(shopIds?.length ? { shopId: shopFilter } : {}), expenseDate: { gte: start, lte: end }, status: 'APPROVED' }, select: { amount: true, category: true } }),
      prisma.payroll.findMany({ where: { ...(shopIds?.length ? { shopId: shopFilter } : {}), periodStart: { gte: start }, periodEnd: { lte: end } }, select: { netPay: true, status: true } }),
      prisma.inventoryItem.findMany({ where: { ...(shopIds?.length ? { shopId: shopFilter } : {}) }, select: { quantity: true, minimum: true } }),
      prisma.taskAssignment.findMany({ where: { ...(shopIds?.length ? { shopId: shopFilter } : {}) }, select: { status: true } }),
      prisma.refund.findMany({ where: { ...(shopIds?.length ? { shopId: shopFilter } : {}), createdAt: { gte: start, lte: end } }, select: { amount: true, status: true } }),
      prisma.auditLog.count({ where: { createdAt: { gte: start, lte: end } } }),
    ]);

    const grossSales = orders.reduce((sum, order) => sum.plus(order.total.toString()), new Decimal(0));
    const successfulPayments = payments.filter((payment) => payment.status === 'SUCCEEDED');
    const netRevenue = successfulPayments.reduce((sum, payment) => sum.plus(payment.amount.toString()), new Decimal(0));
    const purchaseCost = purchases.filter((purchase) => purchase.status !== 'CANCELLED').reduce((sum, purchase) => sum.plus(purchase.total.toString()), new Decimal(0));
    const operatingExpenses = expenses.reduce((sum, expense) => sum.plus(expense.amount.toString()), new Decimal(0));
    const payrollExpenses = payroll.filter((item) => item.status === 'PAID').reduce((sum, item) => sum.plus(item.netPay.toString()), new Decimal(0));
    const totalExpenses = purchaseCost.plus(operatingExpenses).plus(payrollExpenses);
    const refundTotal = refundRecords.reduce((sum, refund) => refund.status === 'APPROVED' ? sum.plus(refund.amount.toString()) : sum, new Decimal(0));
    const netProfit = netRevenue.minus(refundTotal).minus(totalExpenses);
    const lowStock = inventory.filter((item) => Number(item.quantity) < Number(item.minimum)).length;

    ok(res, {
      period: { start, end },
      branches: { total: shops.length, active: shops.filter((shop) => shop.active).length, open: shops.filter((shop) => shop.isOpen).length, closed: shops.filter((shop) => !shop.isOpen).length },
      employees: { total: users, active: await prisma.user.count({ where: { status: 'ACTIVE', archivedAt: null } } ) },
      sales: { grossSales: grossSales.toFixed(2), netRevenue: netRevenue.toFixed(2), netProfit: netProfit.toFixed(2), profitMargin: netRevenue.isZero() ? '0.00' : netProfit.div(netRevenue).times(100).toFixed(2), refunds: refundTotal.toFixed(2), averageOrderValue: orders.length ? grossSales.div(orders.length).toFixed(2) : '0.00' },
      orders: { total: orders.length, completed: orders.filter((order) => ['PAID', 'COMPLETED'].includes(order.status)).length, pending: orders.filter((order) => ['SUBMITTED', 'ACCEPTED', 'PREPARING', 'READY', 'AWAITING_PAYMENT'].includes(order.status)).length, cancelled: orders.filter((order) => order.status === 'CANCELLED').length, dineIn: orders.filter((order) => order.type === 'DINE_IN').length, takeaway: orders.filter((order) => order.type === 'TAKEAWAY').length },
      payments: { pending: payments.filter((payment) => payment.status === 'PENDING').length, succeeded: successfulPayments.length, byMethod: Object.entries(successfulPayments.reduce((acc: Record<string, Decimal>, payment) => { acc[payment.methodCode] = (acc[payment.methodCode] || new Decimal(0)).plus(payment.amount.toString()); return acc; }, {})).map(([method, amount]) => ({ method, amount: amount.toFixed(2) })) },
      expenses: { purchases: purchaseCost.toFixed(2), operating: operatingExpenses.toFixed(2), payroll: payrollExpenses.toFixed(2), total: totalExpenses.toFixed(2) },
      inventory: { items: inventory.length, lowStock, valuationUnavailable: true },
      tasks: { completed: tasks.filter((task) => task.status === 'COMPLETED').length, pending: tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED').length, overdue: tasks.filter((task) => task.status === 'OVERDUE').length },
      auditCount,
    });
  } catch (error) { next(error); }
});

adminRouter.get('/branches', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const page = Math.max(1, Number(req.query.page || 1));
    const take = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const where: any = search ? { OR: [{ name: { contains: search } }, { code: { contains: search } }] } : {};
    const [items, total] = await Promise.all([prisma.shop.findMany({ where, include: { settings: true, managerAssignments: { include: { user: { include: { role: true } } } }, employeeAssignments: true, tables: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take }), prisma.shop.count({ where })]);
    ok(res, { items, pagination: { page, limit: take, total, pages: Math.ceil(total / take) } });
  } catch (error) { next(error); }
});

const branchSchema = z.object({ code: z.string().trim().min(2).max(20), name: z.string().trim().min(2).max(120), address: z.string().trim().max(300).optional(), phone: z.string().trim().max(30).optional(), timezone: z.string().trim().min(2).max(80).default('Asia/Kolkata') });
adminRouter.post('/branches', async (req, res, next) => {
  try {
    const input = branchSchema.parse(req.body);
    if (await prisma.shop.findUnique({ where: { code: input.code } })) throw new ApiError(409, 'Branch code already exists', 'BRANCH_CODE_EXISTS');
    const branch = await prisma.$transaction(async (tx) => {
      const value = await tx.shop.create({ data: { code: input.code, name: input.name, address: input.address, phone: input.phone, timezone: input.timezone, settings: { create: { timezone: input.timezone } } } });
      await audit(req, value.id, 'BRANCH_CREATED', 'BRANCHES', 'shop', value.id, undefined, input);
      return value;
    });
    ok(res, branch, 201);
  } catch (error) { next(error); }
});

adminRouter.patch('/branches/:branchId', async (req, res, next) => {
  try {
    const input = branchSchema.partial().extend({ active: z.boolean().optional(), isOpen: z.boolean().optional() }).parse(req.body);
    const before = await prisma.shop.findUnique({ where: { id: req.params.branchId } });
    if (!before) throw new ApiError(404, 'Branch not found', 'BRANCH_NOT_FOUND');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.shop.update({ where: { id: before.id }, data: input });
      await audit(req, before.id, 'BRANCH_UPDATED', 'BRANCHES', 'shop', before.id, before, input);
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

adminRouter.post('/branches/:branchId/archive', async (req, res, next) => {
  try {
    const input = z.object({ reason: z.string().trim().min(3).max(500), active: z.boolean().default(false) }).parse(req.body);
    const before = await prisma.shop.findUnique({ where: { id: req.params.branchId } });
    if (!before) throw new ApiError(404, 'Branch not found', 'BRANCH_NOT_FOUND');
    const activeOrders = await prisma.order.count({ where: { shopId: before.id, status: { in: ['SUBMITTED', 'ACCEPTED', 'PREPARING', 'READY', 'AWAITING_PAYMENT'] } } });
    if (activeOrders > 0 && !input.active) throw new ApiError(409, 'Branch has unresolved operations', 'BRANCH_UNRESOLVED');
    const updated = await prisma.shop.update({ where: { id: before.id }, data: { active: input.active, archivedAt: input.active ? null : new Date(), isOpen: input.active ? before.isOpen : false } });
    await audit(req, before.id, input.active ? 'BRANCH_RESTORED' : 'BRANCH_ARCHIVED', 'BRANCHES', 'shop', before.id, before, { active: input.active }, input.reason);
    ok(res, updated);
  } catch (error) { next(error); }
});

adminRouter.get('/users', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page = Math.max(1, Number(req.query.page || 1));
    const take = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const where: any = { ...(search ? { OR: [{ fullName: { contains: search } }, { email: { contains: search } }] } : {}), ...(role ? { role: { name: role } } : {}), ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          role: true,
          profile: true,
          employeeAssignments: { include: { shop: true } },
          managerAssignments: { include: { shop: true } },
          sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { expiresAt: true, createdAt: true, userAgent: true, ipAddress: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      prisma.user.count({ where }),
    ]);
    ok(res, { items, pagination: { page, limit: take, total, pages: Math.ceil(total / take) } });
  } catch (error) { next(error); }
});

const adminUserSchema = z.object({ fullName: z.string().trim().min(2).max(100), email: z.string().email().transform((value) => value.toLowerCase()), phone: z.string().trim().max(30).optional(), role: z.enum(['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN_STAFF']), password: z.string().min(12).max(128).optional(), shopIds: z.array(z.string()).default([]), status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']).default('ACTIVE'), forcePasswordChange: z.boolean().default(false), reason: z.string().trim().min(3).max(500).optional() });
adminRouter.post('/users', async (req, res, next) => {
  try {
    const input = adminUserSchema.parse(req.body);
    if (await prisma.user.findUnique({ where: { email: input.email } })) throw new ApiError(409, 'Email already exists', 'EMAIL_EXISTS');
    const role = await prisma.role.findUnique({ where: { name: input.role } });
    if (!role) throw new ApiError(400, 'Invalid role', 'INVALID_ROLE');
    if (input.role !== 'ADMIN' && input.role !== 'MANAGER' && input.shopIds.length !== 1) throw new ApiError(400, 'Non-manager operational employees require exactly one branch', 'INVALID_BRANCH_ASSIGNMENT');
    const shops = await prisma.shop.findMany({ where: { id: { in: input.shopIds } }, select: { id: true } });
    if (shops.length !== new Set(input.shopIds).size) throw new ApiError(400, 'One or more branches are invalid', 'INVALID_BRANCH');
    const created = await prisma.$transaction(async (tx) => {
      const value = await tx.user.create({ data: { fullName: input.fullName, email: input.email, phone: input.phone, status: input.status, forcePasswordChange: input.forcePasswordChange, passwordHash: await argon2.hash(input.password || 'Temporary-' + randomUUID(), { type: argon2.argon2id }), roleId: role.id, profile: { create: {} } } });
      if (input.role === 'MANAGER') await tx.managerShopAssignment.createMany({ data: input.shopIds.map((shopId) => ({ userId: value.id, shopId })) });
      if (input.role !== 'ADMIN' && input.role !== 'MANAGER') await tx.employeeShopAssignment.create({ data: { userId: value.id, shopId: input.shopIds[0] } });
      await audit(req, input.shopIds[0] || null, 'USER_CREATED', 'USERS', 'user', value.id, undefined, { email: value.email, role: input.role, shopIds: input.shopIds }, input.reason);
      return value;
    });
    ok(res, created, 201);
  } catch (error) { next(error); }
});

adminRouter.patch('/users/:userId', async (req, res, next) => {
  try {
    const input = z.object({ fullName: z.string().trim().min(2).max(100).optional(), phone: z.string().trim().max(30).optional(), role: z.enum(['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN_STAFF']).optional(), status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']).optional(), forcePasswordChange: z.boolean().optional(), shopIds: z.array(z.string()).optional(), reason: z.string().trim().min(3).max(500).optional() }).parse(req.body);
    const before = await prisma.user.findUnique({ where: { id: req.params.userId }, include: { role: true, employeeAssignments: true, managerAssignments: true } });
    if (!before) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    if (before.role.name === 'ADMIN' && input.role !== 'ADMIN' && input.role) {
      const activeAdmins = await prisma.user.count({ where: { role: { name: 'ADMIN' }, status: 'ACTIVE', archivedAt: null } });
      if (activeAdmins <= 1) throw new ApiError(409, 'Cannot remove the last active administrator', 'LAST_ADMIN');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const role = input.role ? await tx.role.findUnique({ where: { name: input.role } }) : null;
      const value = await tx.user.update({ where: { id: before.id }, data: { ...(input.fullName ? { fullName: input.fullName } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}), ...(input.status ? { status: input.status } : {}), ...(input.forcePasswordChange !== undefined ? { forcePasswordChange: input.forcePasswordChange } : {}), ...(role ? { roleId: role.id } : {}) } });
      if (input.status && input.status !== 'ACTIVE') await tx.session.updateMany({ where: { userId: before.id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (input.shopIds) {
        await tx.employeeShopAssignment.deleteMany({ where: { userId: before.id } });
        await tx.managerShopAssignment.deleteMany({ where: { userId: before.id } });
        const roleName = input.role || before.role.name;
        if (roleName === 'MANAGER') await tx.managerShopAssignment.createMany({ data: input.shopIds.map((shopId) => ({ userId: before.id, shopId })) });
        if (roleName !== 'ADMIN' && roleName !== 'MANAGER') {
          if (input.shopIds.length !== 1) throw new ApiError(400, 'Operational employees require exactly one branch', 'INVALID_BRANCH_ASSIGNMENT');
          await tx.employeeShopAssignment.create({ data: { userId: before.id, shopId: input.shopIds[0] } });
        }
      }
      await audit(req, input.shopIds?.[0] || null, 'USER_UPDATED', 'USERS', 'user', before.id, before, input, input.reason);
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

adminRouter.post('/users/:userId/revoke-sessions', async (req, res, next) => {
  try {
    const input = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(req, null, 'SESSIONS_REVOKED', 'SECURITY', 'user', user.id, undefined, { revoked: true }, input.reason);
    ok(res, { revoked: true });
  } catch (error) { next(error); }
});

adminRouter.get('/audit-logs', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const take = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const module = typeof req.query.module === 'string' ? req.query.module : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    const actorId = typeof req.query.actorId === 'string' ? req.query.actorId : undefined;
    const start = typeof req.query.start === 'string' ? new Date(req.query.start) : undefined;
    const end = typeof req.query.end === 'string' ? new Date(req.query.end) : undefined;
    const where: any = { ...(module ? { module } : {}), ...(action ? { action } : {}), ...(branchId ? { shopId: branchId } : {}), ...(actorId ? { actorId } : {}), ...(start || end ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}) };
    const [items, total] = await Promise.all([prisma.auditLog.findMany({ where, include: { actor: { include: { role: true } }, shop: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take }), prisma.auditLog.count({ where })]);
    ok(res, { items, pagination: { page, limit: take, total, pages: Math.ceil(total / take) } });
  } catch (error) { next(error); }
});

adminRouter.get('/permissions', async (_req, res, next) => {
  try {
    const permissions = await prisma.permission.findMany({ orderBy: [{ roleName: 'asc' }, { module: 'asc' }, { action: 'asc' }] });
    ok(res, permissions);
  } catch (error) { next(error); }
});

adminRouter.put('/permissions', async (req, res, next) => {
  try {
    const input = z.object({ roleName: z.enum(['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN_STAFF']), module: z.string().trim().min(1).max(80), action: z.enum(['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'RESTORE', 'APPROVE', 'REJECT', 'EXPORT', 'IMPORT', 'MANAGE', 'OVERRIDE']), allowed: z.boolean(), reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const value = await prisma.$transaction(async (tx) => {
      const before = await tx.permission.findUnique({ where: { roleName_module_action: { roleName: input.roleName, module: input.module, action: input.action } } });
      const updated = await tx.permission.upsert({ where: { roleName_module_action: { roleName: input.roleName, module: input.module, action: input.action } }, create: { roleName: input.roleName, module: input.module, action: input.action, allowed: input.allowed }, update: { allowed: input.allowed } });
      await audit(req, null, 'PERMISSION_UPDATED', 'SECURITY', 'permission', updated.id, before, input, input.reason);
      return updated;
    });
    ok(res, value);
  } catch (error) { next(error); }
});

adminRouter.get('/suppliers', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const page = Math.max(1, Number(req.query.page || 1));
    const take = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const where: any = search ? { OR: [{ name: { contains: search } }, { code: { contains: search } }, { phone: { contains: search } }] } : {};
    const [items, total] = await Promise.all([prisma.supplier.findMany({ where, include: { purchases: true }, orderBy: { name: 'asc' }, skip: (page - 1) * take, take }), prisma.supplier.count({ where })]);
    ok(res, { items, pagination: { page, limit: take, total, pages: Math.ceil(total / take) } });
  } catch (error) { next(error); }
});

const supplierSchema = z.object({ code: z.string().trim().min(2).max(30), name: z.string().trim().min(2).max(160), contactName: z.string().trim().max(100).optional(), email: z.string().email().optional().or(z.literal('')), phone: z.string().trim().max(30).optional(), address: z.string().trim().max(300).optional(), reason: z.string().trim().max(500).optional() });
adminRouter.post('/suppliers', async (req, res, next) => {
  try {
    const input = supplierSchema.parse(req.body);
    const supplier = await prisma.$transaction(async (tx) => {
      const value = await tx.supplier.create({ data: { code: input.code, name: input.name, contactName: input.contactName, email: input.email || null, phone: input.phone, address: input.address } });
      await audit(req, null, 'SUPPLIER_CREATED', 'PROCUREMENT', 'supplier', value.id, undefined, input, input.reason);
      return value;
    });
    ok(res, supplier, 201);
  } catch (error) { next(error); }
});

adminRouter.patch('/suppliers/:supplierId', async (req, res, next) => {
  try {
    const input = supplierSchema.partial().parse(req.body);
    const before = await prisma.supplier.findUnique({ where: { id: req.params.supplierId } });
    if (!before) throw new ApiError(404, 'Supplier not found', 'SUPPLIER_NOT_FOUND');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.supplier.update({ where: { id: before.id }, data: { ...(input.code ? { code: input.code } : {}), ...(input.name ? { name: input.name } : {}), ...(input.contactName !== undefined ? { contactName: input.contactName } : {}), ...(input.email !== undefined ? { email: input.email || null } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}), ...(input.address !== undefined ? { address: input.address } : {}) } });
      await audit(req, null, 'SUPPLIER_UPDATED', 'PROCUREMENT', 'supplier', before.id, before, input, input.reason);
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

adminRouter.post('/suppliers/:supplierId/archive', async (req, res, next) => {
  try {
    const input = z.object({ active: z.boolean(), reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const before = await prisma.supplier.findUnique({ where: { id: req.params.supplierId } });
    if (!before) throw new ApiError(404, 'Supplier not found', 'SUPPLIER_NOT_FOUND');
    const updated = await prisma.supplier.update({ where: { id: before.id }, data: { active: input.active, archivedAt: input.active ? null : new Date() } });
    await audit(req, null, input.active ? 'SUPPLIER_RESTORED' : 'SUPPLIER_ARCHIVED', 'PROCUREMENT', 'supplier', before.id, before, input, input.reason);
    ok(res, updated);
  } catch (error) { next(error); }
});

const purchaseSchema = z.object({ shopId: z.string().min(1), supplierId: z.string().min(1), purchaseDate: z.coerce.date(), discount: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'), tax: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'), transportCost: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'), paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).default('UNPAID'), paymentMethod: z.string().max(40).optional(), supplierInvoice: z.string().max(100).optional(), notes: z.string().max(1000).optional(), items: z.array(z.object({ inventoryItemId: z.string().optional(), name: z.string().trim().min(1).max(160), quantity: z.string().regex(/^\d+(\.\d{1,3})?$/), unit: z.string().trim().min(1).max(20), unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/) })).min(1).max(500) });
adminRouter.post('/purchases', async (req, res, next) => {
  try {
    const input = purchaseSchema.parse(req.body);
    if (!await prisma.shop.findUnique({ where: { id: input.shopId } })) throw new ApiError(404, 'Branch not found', 'BRANCH_NOT_FOUND');
    if (!await prisma.supplier.findUnique({ where: { id: input.supplierId } })) throw new ApiError(404, 'Supplier not found', 'SUPPLIER_NOT_FOUND');
    const result = await prisma.$transaction(async (tx) => {
      const subtotal = input.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
      const total = subtotal - Number(input.discount) + Number(input.tax) + Number(input.transportCost);
      if (total < 0) throw new ApiError(400, 'Purchase total cannot be negative', 'INVALID_PURCHASE_TOTAL');
      const count = await tx.purchase.count({ where: { shopId: input.shopId } });
      const purchase = await tx.purchase.create({ data: { purchaseNumber: `PUR-${input.shopId.slice(-6).toUpperCase()}-${String(count + 1).padStart(8, '0')}`, shopId: input.shopId, supplierId: input.supplierId, purchaseDate: input.purchaseDate, subtotal: subtotal.toFixed(2), discount: input.discount, tax: input.tax, transportCost: input.transportCost, total: total.toFixed(2), status: 'PENDING', paymentStatus: input.paymentStatus, paymentMethod: input.paymentMethod, supplierInvoice: input.supplierInvoice, purchasedById: req.auth!.userId, notes: input.notes, items: { create: input.items.map((item) => ({ inventoryItemId: item.inventoryItemId, name: item.name, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, lineTotal: (Number(item.quantity) * Number(item.unitPrice)).toFixed(2) })) } } });
      await audit(req, input.shopId, 'PURCHASE_CREATED', 'PROCUREMENT', 'purchase', purchase.id, undefined, { purchaseNumber: purchase.purchaseNumber, total: purchase.total.toString() });
      return purchase;
    });
    ok(res, result, 201);
  } catch (error) { next(error); }
});

adminRouter.post('/purchases/:purchaseId/approve', async (req, res, next) => {
  try {
    const input = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const purchase = await prisma.purchase.findUnique({ where: { id: req.params.purchaseId }, include: { items: true } });
    if (!purchase) throw new ApiError(404, 'Purchase not found', 'PURCHASE_NOT_FOUND');
    if (purchase.status !== 'PENDING') throw new ApiError(409, 'Purchase is not pending', 'PURCHASE_STATE');
    const approved = await prisma.$transaction(async (tx) => {
      const value = await tx.purchase.update({ where: { id: purchase.id }, data: { status: 'APPROVED', approvedById: req.auth!.userId } });
      for (const item of purchase.items) {
        if (item.inventoryItemId) {
          const inventory = await tx.inventoryItem.findUnique({ where: { id: item.inventoryItemId } });
          if (!inventory) throw new ApiError(404, 'Inventory item missing', 'INVENTORY_ITEM_NOT_FOUND');
          const balance = Number(inventory.quantity) + Number(item.quantity);
          await tx.inventoryItem.update({ where: { id: inventory.id }, data: { quantity: balance.toFixed(3) } });
          await tx.inventoryTransaction.create({ data: { itemId: inventory.id, userId: req.auth!.userId, type: 'PURCHASE', quantity: item.quantity, balanceAfter: balance.toFixed(3), note: `Purchase ${purchase.purchaseNumber}` } });
        }
      }
      await tx.financialLedgerEntry.create({ data: { shopId: purchase.shopId, entryDate: purchase.purchaseDate, type: 'PURCHASE', category: 'Inventory purchase', credit: '0.00', debit: purchase.total, referenceType: 'purchase', referenceId: purchase.id, description: `Approved purchase ${purchase.purchaseNumber}`, createdById: req.auth!.userId } });
      await audit(req, purchase.shopId, 'PURCHASE_APPROVED', 'PROCUREMENT', 'purchase', purchase.id, purchase, { status: 'APPROVED' }, input.reason);
      return value;
    });
    ok(res, approved);
  } catch (error) { next(error); }
});

adminRouter.post('/purchases/:purchaseId/reject', async (req, res, next) => {
  try {
    const input = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const purchase = await prisma.purchase.findUnique({ where: { id: req.params.purchaseId } });
    if (!purchase) throw new ApiError(404, 'Purchase not found', 'PURCHASE_NOT_FOUND');
    if (purchase.status !== 'PENDING') throw new ApiError(409, 'Purchase is not pending', 'PURCHASE_STATE');
    const updated = await prisma.purchase.update({ where: { id: purchase.id }, data: { status: 'REJECTED', approvedById: req.auth!.userId } });
    await audit(req, purchase.shopId, 'PURCHASE_REJECTED', 'PROCUREMENT', 'purchase', purchase.id, purchase, { status: 'REJECTED' }, input.reason);
    ok(res, updated);
  } catch (error) { next(error); }
});

const expenseSchema = z.object({ shopId: z.string().optional(), category: z.string().trim().min(2).max(80), amount: z.string().regex(/^\d+(\.\d{1,2})?$/), expenseDate: z.coerce.date(), paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).default('UNPAID'), paymentMethod: z.string().max(40).optional(), recurring: z.boolean().default(false), vendorName: z.string().trim().max(160).optional(), notes: z.string().trim().max(1000).optional(), reason: z.string().trim().max(500).optional() });
adminRouter.post('/expenses', async (req, res, next) => {
  try {
    const input = expenseSchema.parse(req.body);
    if (input.shopId && !await prisma.shop.findUnique({ where: { id: input.shopId } })) throw new ApiError(404, 'Branch not found', 'BRANCH_NOT_FOUND');
    const expense = await prisma.$transaction(async (tx) => {
      const count = await tx.expense.count({ where: input.shopId ? { shopId: input.shopId } : {} });
      const value = await tx.expense.create({ data: { expenseNumber: `EXP-${String(count + 1).padStart(8, '0')}`, shopId: input.shopId, category: input.category, amount: input.amount, expenseDate: input.expenseDate, paymentStatus: input.paymentStatus, paymentMethod: input.paymentMethod, recurring: input.recurring, vendorName: input.vendorName, notes: input.notes, createdById: req.auth!.userId } });
      await audit(req, input.shopId || null, 'EXPENSE_CREATED', 'FINANCE', 'expense', value.id, undefined, input, input.reason);
      return value;
    });
    ok(res, expense, 201);
  } catch (error) { next(error); }
});

adminRouter.post('/expenses/:expenseId/approve', async (req, res, next) => {
  try {
    const input = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const expense = await prisma.expense.findUnique({ where: { id: req.params.expenseId } });
    if (!expense) throw new ApiError(404, 'Expense not found', 'EXPENSE_NOT_FOUND');
    if (expense.status !== 'PENDING') throw new ApiError(409, 'Expense is not pending', 'EXPENSE_STATE');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.expense.update({ where: { id: expense.id }, data: { status: 'APPROVED', approvedById: req.auth!.userId } });
      await tx.financialLedgerEntry.create({ data: { shopId: expense.shopId, entryDate: expense.expenseDate, type: 'EXPENSE', category: expense.category, debit: expense.amount, credit: '0.00', referenceType: 'expense', referenceId: expense.id, description: `Approved expense ${expense.expenseNumber}`, createdById: req.auth!.userId } });
      await audit(req, expense.shopId, 'EXPENSE_APPROVED', 'FINANCE', 'expense', expense.id, expense, { status: 'APPROVED' }, input.reason);
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

adminRouter.get('/expenses', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const take = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const where: any = { ...(branchId ? { shopId: branchId } : {}), ...(category ? { category } : {}) };
    const [items, total] = await Promise.all([prisma.expense.findMany({ where, orderBy: { expenseDate: 'desc' }, skip: (page - 1) * take, take }), prisma.expense.count({ where })]);
    ok(res, { items, pagination: { page, limit: take, total, pages: Math.ceil(total / take) } });
  } catch (error) { next(error); }
});

adminRouter.get('/purchases', async (req, res, next) => {
  try {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page = Math.max(1, Number(req.query.page || 1));
    const take = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const where: any = { ...(branchId ? { shopId: branchId } : {}), ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([prisma.purchase.findMany({ where, include: { supplier: true, items: true }, orderBy: { purchaseDate: 'desc' }, skip: (page - 1) * take, take }), prisma.purchase.count({ where })]);
    ok(res, { items, pagination: { page, limit: take, total, pages: Math.ceil(total / take) } });
  } catch (error) { next(error); }
});

adminRouter.post('/payroll', async (req, res, next) => {
  try {
    const input = z.object({ shopId: z.string().min(1), userId: z.string().min(1), periodStart: z.coerce.date(), periodEnd: z.coerce.date(), baseSalary: z.string().regex(/^\d+(\.\d{1,2})?$/), overtime: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'), allowance: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'), bonus: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'), deduction: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0') }).parse(req.body);
    const netPay = Number(input.baseSalary) + Number(input.overtime) + Number(input.allowance) + Number(input.bonus) - Number(input.deduction);
    if (netPay < 0) throw new ApiError(400, 'Net pay cannot be negative', 'INVALID_PAYROLL');
    const payroll = await prisma.$transaction(async (tx) => {
      const value = await tx.payroll.create({ data: { shopId: input.shopId, userId: input.userId, periodStart: input.periodStart, periodEnd: input.periodEnd, baseSalary: input.baseSalary, overtime: input.overtime, allowance: input.allowance, bonus: input.bonus, deduction: input.deduction, netPay: netPay.toFixed(2) } });
      await audit(req, input.shopId, 'PAYROLL_CREATED', 'PAYROLL', 'payroll', value.id, undefined, input);
      return value;
    });
    ok(res, payroll, 201);
  } catch (error) { next(error); }
});

adminRouter.post('/payroll/:payrollId/approve', async (req, res, next) => {
  try {
    const input = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const before = await prisma.payroll.findUnique({ where: { id: req.params.payrollId } });
    if (!before) throw new ApiError(404, 'Payroll record not found', 'PAYROLL_NOT_FOUND');
    if (before.status !== 'DRAFT') throw new ApiError(409, 'Payroll is not draft', 'PAYROLL_STATE');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.payroll.update({ where: { id: before.id }, data: { status: 'APPROVED', approvedById: req.auth!.userId } });
      await audit(req, before.shopId, 'PAYROLL_APPROVED', 'PAYROLL', 'payroll', before.id, before, { status: 'APPROVED' }, input.reason);
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

adminRouter.post('/payroll/:payrollId/pay', async (req, res, next) => {
  try {
    const input = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const before = await prisma.payroll.findUnique({ where: { id: req.params.payrollId } });
    if (!before) throw new ApiError(404, 'Payroll record not found', 'PAYROLL_NOT_FOUND');
    if (before.status !== 'APPROVED') throw new ApiError(409, 'Payroll must be approved before payment', 'PAYROLL_STATE');
    const paid = await prisma.$transaction(async (tx) => {
      const value = await tx.payroll.update({ where: { id: before.id }, data: { status: 'PAID', paidAt: new Date() } });
      await tx.financialLedgerEntry.create({ data: { shopId: before.shopId, entryDate: new Date(), type: 'PAYROLL', category: 'Employee salary', debit: before.netPay, credit: '0.00', referenceType: 'payroll', referenceId: before.id, description: 'Approved salary payment', createdById: req.auth!.userId } });
      await audit(req, before.shopId, 'PAYROLL_PAID', 'PAYROLL', 'payroll', before.id, before, { status: 'PAID' }, input.reason);
      return value;
    });
    ok(res, paid);
  } catch (error) { next(error); }
});

adminRouter.get('/payroll', async (req, res, next) => {
  try {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const [items, total] = await Promise.all([prisma.payroll.findMany({ where: { ...(branchId ? { shopId: branchId } : {}), ...(status ? { status } : {}) }, orderBy: { periodStart: 'desc' }, take: 100 }), prisma.payroll.count({ where: { ...(branchId ? { shopId: branchId } : {}), ...(status ? { status } : {}) } })]);
    ok(res, { items, total });
  } catch (error) { next(error); }
});

adminRouter.get('/search', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) ok(res, { users: [], branches: [], orders: [], suppliers: [], purchases: [], expenses: [] });
    else {
      const [users, branches, orders, suppliers, purchases, expenses] = await Promise.all([
        prisma.user.findMany({ where: { OR: [{ fullName: { contains: q } }, { email: { contains: q } }] }, include: { role: true }, take: 10 }),
        prisma.shop.findMany({ where: { OR: [{ name: { contains: q } }, { code: { contains: q } }] }, take: 10 }),
        prisma.order.findMany({ where: { orderNumber: { contains: q } }, take: 10 }),
        prisma.supplier.findMany({ where: { OR: [{ name: { contains: q } }, { code: { contains: q } }] }, take: 10 }),
        prisma.purchase.findMany({ where: { purchaseNumber: { contains: q } }, take: 10 }),
        prisma.expense.findMany({ where: { OR: [{ expenseNumber: { contains: q } }, { category: { contains: q } }] }, take: 10 }),
      ]);
      ok(res, { users, branches, orders, suppliers, purchases, expenses });
    }
  } catch (error) { next(error); }
});

adminRouter.get('/system-health', async (_req, res, next) => {
  try {
    let database = 'ready';
    try { await prisma.$queryRaw`SELECT 1`; } catch { database = 'unavailable'; }
    const [activeSessions, pendingPrintJobs, failedPrintJobs, pendingOutbox, auditEvents] = await Promise.all([
      prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.printJob.count({ where: { status: 'PENDING' } }),
      prisma.printJob.count({ where: { status: 'FAILED' } }),
      prisma.outboxEvent.count({ where: { processedAt: null } }),
      prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    ]);
    ok(res, { backend: 'healthy', database, activeSessions, pendingPrintJobs, failedPrintJobs, pendingOutboxEvents: pendingOutbox, auditEvents24h: auditEvents, uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() });
  } catch (error) { next(error); }
});

adminRouter.get('/settings', async (_req, res, next) => {
  try { ok(res, await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } })); } catch (error) { next(error); }
});

adminRouter.put('/settings/:key', async (req, res, next) => {
  try {
    const input = z.object({ value: z.unknown(), reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const before = await prisma.systemSetting.findUnique({ where: { key: req.params.key } });
    const setting = await prisma.systemSetting.upsert({ where: { key: req.params.key }, create: { key: req.params.key, value: input.value as any, updatedById: req.auth!.userId }, update: { value: input.value as any, updatedById: req.auth!.userId } });
    await audit(req, null, 'SYSTEM_SETTING_UPDATED', 'ADMINISTRATION', 'system_setting', req.params.key, before, input.value, input.reason);
    ok(res, setting);
  } catch (error) { next(error); }
});

adminRouter.post('/corrections', async (req, res, next) => {
  try {
    const input = z.object({ shopId: z.string().optional(), resourceType: z.string().trim().min(2).max(80), resourceId: z.string().trim().min(1).max(100), reason: z.string().trim().min(10).max(1000), before: z.record(z.string(), z.unknown()).default({}), proposed: z.record(z.string(), z.unknown()).default({}) }).parse(req.body);
    await audit(req, input.shopId || null, 'ADMINISTRATIVE_CORRECTION', 'ADMINISTRATION', input.resourceType, input.resourceId, input.before, input.proposed, input.reason);
    ok(res, { correctionRecorded: true });
  } catch (error) { next(error); }
});
