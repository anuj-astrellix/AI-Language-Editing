import { fail, ok } from '@/lib/api/responses';
import { pauseEditingJob } from '@/lib/jobs/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    await pauseEditingJob(id);
    return ok({ jobId: id, status: 'PAUSED' });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to pause job', 500);
  }
}
