import { extractDocxSegments } from '@/lib/docx/extractor';

export async function buildHtmlPreviewFromDocx(docxBuffer: Buffer): Promise<string> {
  const parsed = await extractDocxSegments(docxBuffer);

  const body = parsed.segments
    .map((segment) => `<p>${escapeHtml(segment.text)}</p>`)
    .join('\n');

  return `<!doctype html><html><head><meta charset="UTF-8" /><title>Document Preview</title></head><body>${body}</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
