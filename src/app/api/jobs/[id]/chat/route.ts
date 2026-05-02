import { fail, ok } from '@/lib/api/responses';
import { assistantQuestionSchema } from '@/lib/api/schemas';
import { askDocumentAssistant } from '@/lib/jobs/service';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const payload = assistantQuestionSchema.parse(await request.json());
    const result = await askDocumentAssistant(id, payload.question);
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to process assistant request', 500);
  }
}
