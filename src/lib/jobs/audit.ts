import { appendAuditLog } from '@/lib/jobs/repository';

export async function logAudit(action: string, detailsJson: Record<string, unknown>, jobId?: string, userId?: string): Promise<void> {
  await appendAuditLog({
    action,
    detailsJson,
    jobId,
    userId
  });
}
