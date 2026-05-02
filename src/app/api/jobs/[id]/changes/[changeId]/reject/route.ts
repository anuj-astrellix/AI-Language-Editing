import { fail, ok } from '@/lib/api/responses';
import { rejectChange } from '@/lib/jobs/service';

interface RouteContext {
  params: Promise<{ id: string; changeId: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id, changeId } = await context.params;

  try {
    await rejectChange(id, changeId);
    return ok({ jobId: id, changeId, decision: 'REJECTED' });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to reject change', 500);
  }
}
