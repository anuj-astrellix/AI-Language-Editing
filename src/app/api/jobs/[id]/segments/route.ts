import { fail, ok } from '@/lib/api/responses';
import { getSegments } from '@/lib/jobs/service';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const segments = await getSegments(id);
    return ok({ segments });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to list segments', 500);
  }
}
