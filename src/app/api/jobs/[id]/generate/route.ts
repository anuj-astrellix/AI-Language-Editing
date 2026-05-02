import { fail, ok } from '@/lib/api/responses';
import { generateFinalFiles } from '@/lib/jobs/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    await generateFinalFiles(id);
    return ok({ jobId: id, generated: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to generate files', 500);
  }
}
