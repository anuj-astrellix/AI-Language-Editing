import { fail, ok } from '@/lib/api/responses';
import { acceptAllChanges } from '@/lib/jobs/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    await acceptAllChanges(id);
    return ok({ jobId: id, decision: 'ACCEPTED' });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to accept all changes', 500);
  }
}
