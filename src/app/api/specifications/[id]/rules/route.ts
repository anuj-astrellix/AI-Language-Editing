import { z } from 'zod';

import { fail, ok } from '@/lib/api/responses';
import { updateRules } from '@/lib/jobs/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const schema = z.object({
  rules: z.array(z.string().min(1)).min(1)
});

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const payload = schema.parse(await request.json());
    await updateRules(id, payload.rules);
    return ok({ specificationId: id, rules: payload.rules });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to update rules', 500);
  }
}
