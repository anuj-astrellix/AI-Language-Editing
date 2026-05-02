import { GeneratedFileType } from '@/lib/jobs/types';

import { fail } from '@/lib/api/responses';
import { getGeneratedDownload } from '@/lib/jobs/service';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const typeMap: Record<string, GeneratedFileType> = {
  clean: GeneratedFileType.CLEAN_DOCX,
  comparison: GeneratedFileType.COMPARISON_DOCX,
  changelog: GeneratedFileType.CHANGELOG_PDF,
  preview: GeneratedFileType.HTML_PREVIEW,
  audit: GeneratedFileType.JSON_AUDIT
};

const fileNames: Record<GeneratedFileType, string> = {
  [GeneratedFileType.CLEAN_DOCX]: 'edited-clean.docx',
  [GeneratedFileType.COMPARISON_DOCX]: 'edited-comparison.docx',
  [GeneratedFileType.CHANGELOG_PDF]: 'change-log.pdf',
  [GeneratedFileType.HTML_PREVIEW]: 'preview.html',
  [GeneratedFileType.JSON_AUDIT]: 'audit.json'
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;

  try {
    const url = new URL(request.url);
    const queryType = url.searchParams.get('type') ?? 'clean';
    const fileType = typeMap[queryType];

    if (!fileType) {
      return fail('Invalid download type', 400);
    }

    const { file, data } = await getGeneratedDownload(id, fileType);

    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="${fileNames[fileType]}"`
      }
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to download file', 404);
  }
}
