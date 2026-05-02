import { NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api/responses';
import { createDocument } from '@/lib/jobs/repository';
import { scanFileForViruses } from '@/lib/security/virusScanner';
import { validateUpload } from '@/lib/security/uploadValidation';
import { storeUpload } from '@/lib/storage/objectStorage';
import { sha256 } from '@/lib/utils/hash';

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return fail('Missing document file', 400);
    }

    validateUpload(file, 'document');

    const fileBytes = Buffer.from(await file.arrayBuffer());
    const scanResult = await scanFileForViruses(fileBytes);
    if (!scanResult.clean) {
      return fail(`Upload blocked by scanner: ${scanResult.reason ?? 'malware detected'}`, 400);
    }

    const storagePath = await storeUpload(file.name, fileBytes);
    const document = await createDocument({
      originalFilename: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
      storagePath,
      checksum: sha256(fileBytes)
    });

    return ok({
      documentId: document.id,
      filename: document.originalFilename,
      size: document.fileSizeBytes
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to upload document', 500);
  }
}
