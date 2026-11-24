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

tasksRouter.patch('/:shopId/:taskId', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = createTaskSchema.partial().parse(req.body);
    const task = await prisma.taskAssignment.findFirst({ where: { id: req.params.taskId, shopId: req.params.shopId } });
    if (!task) throw new ApiError(404, 'Task not found', 'TASK_NOT_FOUND');
    if (task.status === 'COMPLETED') throw new ApiError(409, 'Completed task history cannot be modified', 'TASK_COMPLETED');
    if (input.memberIds?.length) {
      const assigned = await prisma.employeeShopAssignment.findMany({ where: { shopId: req.params.shopId, userId: { in: input.memberIds } }, select: { userId: true } });
      if (assigned.length !== new Set(input.memberIds).size) throw new ApiError(403, 'One or more employees are outside this shop', 'EMPLOYEE_SHOP_FORBIDDEN');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.taskAssignment.update({ where: { id: task.id }, data: { ...(input.title ? { title: input.title } : {}), ...(input.description !== undefined ? { description: input.description } : {}), ...(input.scheduledStart ? { scheduledStart: input.scheduledStart } : {}), ...(input.scheduledEnd ? { scheduledEnd: input.scheduledEnd } : {}), ...(input.priority ? { priority: input.priority } : {}), ...(input.photoRequired !== undefined ? { photoRequired: input.photoRequired } : {}), ...(input.requiredPhotoCount !== undefined ? { requiredPhotoCount: input.requiredPhotoCount } : {}), ...(input.approvalRequired !== undefined ? { approvalRequired: input.approvalRequired } : {}) } });
      if (input.memberIds) {
        await tx.taskAssignmentMember.deleteMany({ where: { assignmentId: task.id } });
        await tx.taskAssignmentMember.createMany({ data: input.memberIds.map((userId) => ({ assignmentId: task.id, userId })) });
      }
      if (input.checklist) {
        await tx.taskChecklist.deleteMany({ where: { assignmentId: task.id } });
        await tx.taskChecklist.createMany({ data: input.checklist.map((item, sortOrder) => ({ assignmentId: task.id, label: item.label, isRequired: item.isRequired, sortOrder })) });
      }
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TASK_UPDATED', resourceType: 'task', resourceId: task.id, requestId: String(req.headers['x-request-id']), beforeJson: task, afterJson: input } });
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

tasksRouter.post('/:shopId/:taskId/cancel', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body);
    const task = await prisma.taskAssignment.findFirst({ where: { id: req.params.taskId, shopId: req.params.shopId } });
    if (!task) throw new ApiError(404, 'Task not found', 'TASK_NOT_FOUND');
    if (task.status === 'COMPLETED') throw new ApiError(409, 'Completed history cannot be cancelled silently', 'TASK_COMPLETED');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.taskAssignment.update({ where: { id: task.id }, data: { status: 'CANCELLED' } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TASK_CANCELLED', resourceType: 'task', resourceId: task.id, requestId: String(req.headers['x-request-id']), beforeJson: task, afterJson: { status: 'CANCELLED', reason: input.reason } } });
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

tasksRouter.post('/:shopId/:taskId/duplicate', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ scheduledStart: z.coerce.date(), scheduledEnd: z.coerce.date() }).parse(req.body);
    const task = await prisma.taskAssignment.findFirst({ where: { id: req.params.taskId, shopId: req.params.shopId }, include: { members: true, checklists: true } });
    if (!task) throw new ApiError(404, 'Task not found', 'TASK_NOT_FOUND');
    const duplicated = await prisma.$transaction(async (tx) => {
      const value = await tx.taskAssignment.create({ data: { shopId: req.params.shopId, title: `${task.title} Copy`, description: task.description, scheduledStart: input.scheduledStart, scheduledEnd: input.scheduledEnd, completionMode: task.completionMode, priority: task.priority, photoRequired: task.photoRequired, requiredPhotoCount: task.requiredPhotoCount, approvalRequired: task.approvalRequired, members: { create: task.members.map((member) => ({ userId: member.userId })) }, checklists: { create: task.checklists.map((item) => ({ label: item.label, isRequired: item.isRequired, sortOrder: item.sortOrder })) } } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TASK_DUPLICATED', resourceType: 'task', resourceId: value.id, requestId: String(req.headers['x-request-id']), afterJson: { sourceTaskId: task.id } } });
      return value;
    });
    ok(res, duplicated, 201);
  } catch (error) { next(error); }
});

tasksRouter.post('/:shopId/:taskId/approve', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ decision: z.enum(['APPROVE', 'REJECT']), reason: z.string().trim().max(300).optional() }).parse(req.body);
    const task = await prisma.taskAssignment.findFirst({ where: { id: req.params.taskId, shopId: req.params.shopId } });
    if (!task) throw new ApiError(404, 'Task not found', 'TASK_NOT_FOUND');
    if (task.status !== 'AWAITING_APPROVAL') throw new ApiError(409, 'Task is not awaiting approval', 'TASK_APPROVAL_STATE');
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.taskAssignment.update({ where: { id: task.id }, data: { status: input.decision === 'APPROVE' ? 'COMPLETED' : 'REJECTED', completedAt: input.decision === 'APPROVE' ? new Date() : null } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: input.decision === 'APPROVE' ? 'TASK_APPROVED' : 'TASK_REJECTED', resourceType: 'task', resourceId: task.id, requestId: String(req.headers['x-request-id']), beforeJson: task, afterJson: input } });
      return value;
    });
    ok(res, updated);
  } catch (error) { next(error); }
});

const templateSchema = z.object({ title: z.string().trim().min(2).max(160), description: z.string().max(1000).optional(), recurrence: z.enum(['NONE', 'DAILY', 'WEEKLY', 'CUSTOM']).default('NONE'), photoRequired: z.boolean().default(false), requiredPhotoCount: z.number().int().min(1).max(10).optional(), approvalRequired: z.boolean().default(false), checklist: z.array(z.object({ label: z.string().trim().min(1).max(200), isRequired: z.boolean().default(true) })).default([]) });

tasksRouter.get('/:shopId/templates', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try { ok(res, await prisma.taskTemplate.findMany({ where: { shopId: req.params.shopId, active: true }, include: { checklists: true, schedules: true }, orderBy: { createdAt: 'desc' } })); } catch (error) { next(error); }
});

tasksRouter.post('/:shopId/templates', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = templateSchema.parse(req.body);
    const template = await prisma.$transaction(async (tx) => {
      const value = await tx.taskTemplate.create({ data: { shopId: req.params.shopId, title: input.title, description: input.description, recurrence: input.recurrence, photoRequired: input.photoRequired, requiredPhotoCount: input.requiredPhotoCount || 0, approvalRequired: input.approvalRequired, checklists: { create: input.checklist.map((item, sortOrder) => ({ label: item.label, isRequired: item.isRequired, sortOrder })) } } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TASK_TEMPLATE_CREATED', resourceType: 'task_template', resourceId: value.id, requestId: String(req.headers['x-request-id']), afterJson: input } });
      return value;
    });
    ok(res, template, 201);
  } catch (error) { next(error); }
});

tasksRouter.post('/:shopId/templates/:templateId/archive', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const template = await prisma.taskTemplate.findFirst({ where: { id: req.params.templateId, shopId: req.params.shopId } });
    if (!template) throw new ApiError(404, 'Template not found', 'TASK_TEMPLATE_NOT_FOUND');
    const archived = await prisma.$transaction(async (tx) => {
      const value = await tx.taskTemplate.update({ where: { id: template.id }, data: { active: false } });
      await tx.taskSchedule.updateMany({ where: { templateId: template.id }, data: { active: false } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TASK_TEMPLATE_ARCHIVED', resourceType: 'task_template', resourceId: template.id, requestId: String(req.headers['x-request-id']), beforeJson: template, afterJson: { active: false } } });
      return value;
    });
    ok(res, archived);
  } catch (error) { next(error); }
});

tasksRouter.post('/:shopId/templates/:templateId/schedule', requireRole('MANAGER'), requireShop, async (req, res, next) => {
  try {
    const input = z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date(), recurrenceRule: z.string().max(300).optional() }).parse(req.body);
    if (input.endsAt <= input.startsAt) throw new ApiError(400, 'Schedule end must be after start', 'INVALID_SCHEDULE');
    const template = await prisma.taskTemplate.findFirst({ where: { id: req.params.templateId, shopId: req.params.shopId, active: true } });
    if (!template) throw new ApiError(404, 'Template not found', 'TASK_TEMPLATE_NOT_FOUND');
    const schedule = await prisma.$transaction(async (tx) => {
      const value = await tx.taskSchedule.create({ data: { templateId: template.id, shopId: req.params.shopId, startsAt: input.startsAt, endsAt: input.endsAt, recurrenceRule: input.recurrenceRule } });
      await tx.auditLog.create({ data: { shopId: req.params.shopId, actorId: req.auth!.userId, action: 'TASK_SCHEDULE_CREATED', resourceType: 'task_schedule', resourceId: value.id, requestId: String(req.headers['x-request-id']), afterJson: input } });
      return value;
    });
    ok(res, schedule, 201);
  } catch (error) { next(error); }
});
