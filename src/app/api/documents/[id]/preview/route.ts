import { GeneratedFileType } from '@/lib/jobs/types';

import { fail } from '@/lib/api/responses';
import { buildHtmlPreviewFromDocx } from '@/lib/docx/preview';
import { getDocument, getGeneratedFile, getMostRecentJobForDocument } from '@/lib/jobs/repository';
import { readStoredFile } from '@/lib/storage/objectStorage';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;

  try {
    const document = await getDocument(id);
    if (!document) {
      return fail('Document not found', 404);
    }

    const url = new URL(request.url);
    const version = url.searchParams.get('version') ?? 'original';

    let targetPath = document.storagePath;

    if (version === 'edited') {
      const latestJob = await getMostRecentJobForDocument(document.id);
      if (latestJob) {
        const cleanFile = await getGeneratedFile(latestJob.id, GeneratedFileType.CLEAN_DOCX);
        if (cleanFile) {
          targetPath = cleanFile.storagePath;
        }
      }
    }

    const buffer = await readStoredFile(targetPath);
    const html = await buildHtmlPreviewFromDocx(buffer);

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to build preview', 500);
  }
}
