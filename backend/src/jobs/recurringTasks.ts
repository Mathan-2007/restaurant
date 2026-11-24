import { prisma } from '../config/database.js';

export async function generateRecurringTasks() {
  const now = new Date();
  const schedules = await prisma.taskSchedule.findMany({
    where: { active: true, template: { active: true, recurrence: { in: ['DAILY', 'WEEKLY', 'CUSTOM'] } } },
    include: { template: { include: { checklists: true } } },
  });
  let generated = 0;
  for (const schedule of schedules) {
    let occurrenceStart = schedule.nextOccurrenceAt || schedule.startsAt;
    while (occurrenceStart <= now) {
      const duration = schedule.endsAt.getTime() - schedule.startsAt.getTime();
      const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
      const key = `${schedule.id}:${occurrenceStart.toISOString()}`;
      try {
        await prisma.taskAssignment.create({
          data: { shopId: schedule.shopId, title: schedule.template.title, description: schedule.template.description, scheduledStart: occurrenceStart, scheduledEnd: occurrenceEnd, photoRequired: schedule.template.photoRequired, requiredPhotoCount: schedule.template.requiredPhotoCount, approvalRequired: schedule.template.approvalRequired, occurrenceKey: key, checklists: { create: schedule.template.checklists.map((item) => ({ label: item.label, isRequired: item.isRequired, sortOrder: item.sortOrder })) } },
        });
        generated++;
      } catch (_error) {
        // Unique occurrenceKey collision means this occurrence was already generated.
      }

      const interval = schedule.template.recurrence === 'DAILY' ? 86_400_000 : schedule.template.recurrence === 'WEEKLY' ? 604_800_000 : 86_400_000;
      occurrenceStart = new Date(occurrenceStart.getTime() + interval);
      await prisma.taskSchedule.update({ where: { id: schedule.id }, data: { lastGeneratedAt: now, nextOccurrenceAt: occurrenceStart } });
    }
  }
  return generated;
}
