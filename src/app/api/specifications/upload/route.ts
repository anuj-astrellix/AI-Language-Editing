import { NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api/responses';
import { createSpecification } from '@/lib/jobs/repository';
import { validateUpload } from '@/lib/security/uploadValidation';
import { extractRules } from '@/lib/spec/ruleDetection';
import { extractSpecificationText } from '@/lib/spec/specExtractor';
import { storeUpload } from '@/lib/storage/objectStorage';

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const fileEntry = form.get('file');
    const textEntry = form.get('text');
    const documentIdEntry = form.get('documentId');

    const file = fileEntry instanceof File ? fileEntry : null;
    const pastedText = typeof textEntry === 'string' ? textEntry : null;

    if (file) {
      validateUpload(file, 'specification');
    }

    let sourcePath: string | undefined;
    if (file) {
      const bytes = Buffer.from(await file.arrayBuffer());
      sourcePath = await storeUpload(file.name, bytes);
    }

    const extracted = await extractSpecificationText(file, pastedText);
    const rules = extractRules(extracted.extractedText);

    const specification = await createSpecification({
      sourceType: extracted.sourceType,
      rawText: extracted.rawText,
      extractedText: extracted.extractedText,
      rulesJson: rules,
      sourcePath,
      documentId: typeof documentIdEntry === 'string' && documentIdEntry.length > 0 ? documentIdEntry : undefined
    });

    return ok({
      specificationId: specification.id,
      sourceType: specification.sourceType,
      detectedRules: rules
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to upload specification', 500);
  }
}
