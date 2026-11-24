import { env } from '../config/env.js';
import { prisma } from '../config/database.js';

export async function processPrintQueue() {
  const jobs = await prisma.printJob.findMany({
    where: { status: 'PENDING', attempts: { lt: 5 }, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(Date.now() - 60_000) } }] },
    include: { printer: true }, take: 25, orderBy: { createdAt: 'asc' },
  });
  let processed = 0;
  for (const job of jobs) {
    const claimed = await prisma.printJob.updateMany({ where: { id: job.id, status: 'PENDING', OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(Date.now() - 60_000) } }] }, data: { claimedAt: new Date(), attempts: { increment: 1 }, lastAttemptAt: new Date() } });
    if (claimed.count !== 1) continue;

    try {
      const bridgeUrl = job.printer.bridgeUrl || env.PRINT_BRIDGE_URL;
      let confirmed = false;
      if (env.NODE_ENV === 'development' && !bridgeUrl) {
        confirmed = true;
      } else if (bridgeUrl) {
        const response = await fetch(`${bridgeUrl.replace(/\/$/, '')}/print`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ printerId: job.printerId, payload: job.payload, paperWidth: job.printer.paperWidth }) , signal: AbortSignal.timeout(10_000) });
        const result = await response.json().catch(() => ({}));
        confirmed = response.ok && result.delivered === true;
        if (!confirmed) throw new Error(typeof result.error === 'string' ? result.error : `Print bridge rejected delivery (${response.status})`);
      } else {
        throw new Error('Production print bridge is not configured');
      }

      if (confirmed) await prisma.printJob.update({ where: { id: job.id }, data: { status: 'PRINTED', claimedAt: null, deliveredAt: new Date(), lastError: null } });
      processed++;
    } catch (error) {
      const nextAttempts = job.attempts + 1;
      await prisma.printJob.update({ where: { id: job.id }, data: { status: nextAttempts >= 5 ? 'FAILED' : 'PENDING', claimedAt: null, lastError: error instanceof Error ? error.message : 'Printer delivery failed' } });
    }
  }
  return processed;
}
