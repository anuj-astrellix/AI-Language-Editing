import { fail, ok } from '@/lib/api/responses';
import { acceptChange } from '@/lib/jobs/service';

interface RouteContext {
  params: Promise<{ id: string; changeId: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id, changeId } = await context.params;

  try {
    await acceptChange(id, changeId);
    return ok({ jobId: id, changeId, decision: 'ACCEPTED' });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to accept change', 500);
  }
}
