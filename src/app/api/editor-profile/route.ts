import { fail, ok } from '@/lib/api/responses';
import { editorProfileSchema } from '@/lib/api/schemas';
import { getActiveEditorProfile, saveEditorProfile } from '@/lib/jobs/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const profile = await getActiveEditorProfile();
    return ok({ profile });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to load editor profile', 500);
  }
}

export async function POST(request: Request) {
  try {
    const payload = editorProfileSchema.parse(await request.json());
    const profile = await saveEditorProfile({
      name: payload.name,
      email: payload.email,
      companyId: payload.companyId ?? null,
      signature: payload.signature ?? null
    });
    return ok({ profile });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to save editor profile', 400);
  }
}
