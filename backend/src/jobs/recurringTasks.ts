import { prisma } from '../config/database.js';

export async function generateRecurringTasks() {
  const schedules = await prisma.taskSchedule.findMany({ where: { active: true, template: { active: true, recurrence: { in: ['DAILY', 'WEEKLY'] } } }, include: { template: { include: { checklists: true } } } });
  let generated = 0;
  for (const schedule of schedules) {
    const horizon = schedule.template.recurrence === 'DAILY' ? 86400000 : 7 * 86400000;
    const nextStart = new Date(schedule.startsAt.getTime() + horizon);
    const nextEnd = new Date(schedule.endsAt.getTime() + horizon);
    const exists = await prisma.taskAssignment.findFirst({ where: { shopId: schedule.shopId, title: schedule.template.title, scheduledStart: nextStart } });
    if (!exists) {
      await prisma.taskAssignment.create({ data: { shopId: schedule.shopId, title: schedule.template.title, description: schedule.template.description, scheduledStart: nextStart, scheduledEnd: nextEnd, photoRequired: schedule.template.photoRequired, requiredPhotoCount: schedule.template.requiredPhotoCount, approvalRequired: schedule.template.approvalRequired, checklists: { create: schedule.template.checklists.map((item) => ({ label: item.label, isRequired: item.isRequired, sortOrder: item.sortOrder })) } } });
      generated++;
    }
  }
  return generated;
}
