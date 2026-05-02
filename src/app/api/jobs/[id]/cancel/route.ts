import { fail, ok } from '@/lib/api/responses';
import { cancelEditingJob } from '@/lib/jobs/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    await cancelEditingJob(id);
    return ok({ jobId: id, status: 'CANCELED' });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to cancel job', 500);
  }
}
