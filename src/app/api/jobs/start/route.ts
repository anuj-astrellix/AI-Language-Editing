import { NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api/responses';
import { startJobSchema } from '@/lib/api/schemas';
import { startEditingJob } from '@/lib/jobs/service';

export async function POST(request: NextRequest) {
  try {
    const payload = startJobSchema.parse(await request.json());

    const result = await startEditingJob({
      documentId: payload.documentId,
      specificationId: payload.specificationId,
      allowMeaningChanges: payload.allowMeaningChanges,
      allowProtectedEdits: payload.allowProtectedEdits,
      model: payload.model,
      editingMode: payload.editingMode,
      additionalInstructions: payload.additionalInstructions
    });

    return ok(result, 202);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to start job', 500);
  }
}
