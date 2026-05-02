import { fail, ok } from '@/lib/api/responses';
import { getJobStatus } from '@/lib/jobs/service';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const job = await getJobStatus(id);
    return ok(job);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to get job', 404);
  }
}
