import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole, requireShop } from '../../middleware/auth.js';
import { ApiError, ok } from '../../utils/api.js';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(160), description: z.string().max(1000).optional(),
  scheduledStart: z.coerce.date(), scheduledEnd: z.coerce.date(), completionMode: z.enum(['INDIVIDUAL', 'COLLABORATIVE', 'INDIVIDUAL_COPIES']).default('INDIVIDUAL'),
  priority: z.number().int().min(1).max(5).default(2), photoRequired: z.boolean().default(false), requiredPhotoCount: z.number().int().min(1).max(10).optional(), approvalRequired: z.boolean().default(false),
  memberIds: z.array(z.string()).optional(), checklist: z.array(z.object({ label: z.string().trim().min(1).max(200), isRequired: z.boolean().default(true) })).default([]),
}).refine((value) => value.scheduledEnd > value.scheduledStart, { message: 'scheduledEnd must be after scheduledStart', path: ['scheduledEnd'] });

tasksRouter.get('/:shopId', requireShop, async (req, res, next) => {
  try {
    const tasks = await prisma.taskAssignment.findMany({ where: { shopId: req.params.shopId, ...(req.auth!.role === 'MANAGER' ? {} : { members: { some: { userId: req.auth!.userId } } }) }, include: { members: { include: { user: { select: { id: true, fullName: true } } } }, checklists: { include: { responses: true } }, photoEvidence: true }, orderBy: { scheduledStart: 'asc' } });
    ok(res, tasks);
  } catch (error) { next(error); }
});

tasksRouter.post('/:shopId', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = createTaskSchema.parse(req.body);
    if (input.memberIds?.length) {
      const assigned = await prisma.employeeShopAssignment.findMany({ where: { shopId: req.params.shopId, userId: { in: input.memberIds } }, select: { userId: true } });
      if (assigned.length !== input.memberIds.length) throw new ApiError(403, 'One or more employees are not assigned to this shop', 'EMPLOYEE_SHOP_FORBIDDEN');
    }
    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.taskAssignment.create({ data: { shopId: req.params.shopId, title: input.title, description: input.description, scheduledStart: input.scheduledStart, scheduledEnd: input.scheduledEnd, completionMode: input.completionMode, priority: input.priority, photoRequired: input.photoRequired, requiredPhotoCount: input.requiredPhotoCount ?? 0, approvalRequired: input.approvalRequired, members: { create: (input.memberIds ?? []).map((userId) => ({ userId })) }, checklists: { create: input.checklist.map((item, sortOrder) => ({ ...item, sortOrder })) } } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TASK_CREATED', resourceType: 'task', resourceId: created.id, requestId: String(req.headers['x-request-id']), afterJson: input } });
      return created;
    });
    ok(res, task, 201);
  } catch (error) { next(error); }
});

const completeSchema = z.object({ checklistIds: z.array(z.string()).default([]) });
tasksRouter.post('/:shopId/:taskId/complete', requireShop, async (req, res, next) => {
  try {
    const input = completeSchema.parse(req.body);
    const task = await prisma.taskAssignment.findFirst({
      where: { id: req.params.taskId, shopId: req.params.shopId, members: { some: { userId: req.auth!.userId } } },
      include: { checklists: true, photoEvidence: true },
    });
    if (!task) throw new ApiError(404, 'Task not found or not assigned to you', 'TASK_NOT_FOUND');
    const requiredChecklistIds = task.checklists.filter((item) => item.isRequired).map((item) => item.id);
    if (requiredChecklistIds.some((id) => !input.checklistIds.includes(id))) throw new ApiError(400, 'All required checklist items must be completed', 'CHECKLIST_INCOMPLETE');
    if (task.photoRequired && task.photoEvidence.filter((photo) => photo.userId === req.auth!.userId).length < task.requiredPhotoCount) throw new ApiError(400, 'Required photo evidence is missing', 'PHOTO_REQUIRED');
    const completed = await prisma.$transaction(async (tx) => {
      const value = await tx.taskAssignment.update({ where: { id: task.id }, data: { status: task.approvalRequired ? 'AWAITING_APPROVAL' : 'COMPLETED', completedAt: task.approvalRequired ? null : new Date(), actualStart: task.actualStart ?? new Date() } });
      await tx.taskChecklistResponse.createMany({ data: input.checklistIds.map((checklistId) => ({ checklistId, userId: req.auth!.userId, completed: true, completedAt: new Date() })), skipDuplicates: true });
      await tx.taskCompletionRecord.create({ data: { assignmentId: task.id, shopId: req.params.shopId, userId: req.auth!.userId } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TASK_COMPLETED', resourceType: 'task', resourceId: task.id, requestId: String(req.headers['x-request-id']) } });
      return value;
    });
    ok(res, completed);
  } catch (error) { next(error); }
});
