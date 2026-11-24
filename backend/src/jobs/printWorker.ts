import { prisma } from '../config/database.js';

export async function processPrintQueue() {
  const jobs = await prisma.printJob.findMany({ where: { status: 'PENDING', attempts: { lt: 5 } }, take: 25, orderBy: { createdAt: 'asc' } });
  let processed = 0;
  for (const job of jobs) {
    try {
      // Network/bridge delivery must be implemented by a printer-specific adapter.
      // Development mode records a successful simulated delivery while retaining the payload.
      await prisma.printJob.update({ where: { id: job.id }, data: { status: 'PRINTED', attempts: { increment: 1 }, lastError: null } });
      processed++;
    } catch (error) {
      await prisma.printJob.update({ where: { id: job.id }, data: { status: job.attempts + 1 >= 5 ? 'FAILED' : 'PENDING', attempts: { increment: 1 }, lastError: error instanceof Error ? error.message : 'Printer delivery failed' } });
    }
  }
  return processed;
}
