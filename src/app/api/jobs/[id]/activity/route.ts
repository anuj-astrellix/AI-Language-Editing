import { fail, ok } from '@/lib/api/responses';
import { getJobActivity } from '@/lib/jobs/service';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const limitParam = new URL(request.url).searchParams.get('limit');
  const parsedLimit = Number(limitParam ?? '250');
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(1000, parsedLimit)) : 250;

  try {
    const activity = await getJobActivity(id, limit);
    return ok({ activity });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to load job activity', 500);
  }
}
