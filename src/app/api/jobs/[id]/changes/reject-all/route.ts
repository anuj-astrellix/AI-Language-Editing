import { fail, ok } from '@/lib/api/responses';
import { rejectAllChanges } from '@/lib/jobs/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    await rejectAllChanges(id);
    return ok({ jobId: id, decision: 'REJECTED' });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to reject all changes', 500);
  }
}
