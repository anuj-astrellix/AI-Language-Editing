import { fail, ok } from '@/lib/api/responses';
import { getChanges } from '@/lib/jobs/service';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const changes = await getChanges(id);
    return ok({ changes });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to list changes', 500);
  }
}
