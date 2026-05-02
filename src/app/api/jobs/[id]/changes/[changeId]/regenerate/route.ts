import { fail, ok } from '@/lib/api/responses';
import { regenerateSuggestionSchema } from '@/lib/api/schemas';
import { regenerateChangeSuggestion } from '@/lib/jobs/service';

interface RouteContext {
  params: Promise<{ id: string; changeId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id, changeId } = await context.params;

  let payload: { seedEditedText?: string; instruction?: string } = {};

  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      payload = regenerateSuggestionSchema.parse(JSON.parse(text));
    }
  } catch {
    // Empty or invalid body falls back to default regeneration behavior.
  }

  try {
    const change = await regenerateChangeSuggestion(id, changeId, undefined, {
      seedEditedText: payload.seedEditedText,
      instruction: payload.instruction
    });
    return ok({ jobId: id, changeId, change });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to regenerate change', 500);
  }
}
