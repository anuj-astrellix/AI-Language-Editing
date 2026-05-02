import { fail, ok } from '@/lib/api/responses';
import { resumeEditingJob } from '@/lib/jobs/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    await resumeEditingJob(id);
    return ok({ jobId: id, status: 'RUNNING' });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to resume job', 500);
  }
}
