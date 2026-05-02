import { env } from '@/lib/config';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';
const TXT_MIME = 'text/plain';

export type UploadKind = 'document' | 'specification';

export function validateUpload(file: File, kind: UploadKind): void {
  const maxSizeBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new Error(`File exceeds max size of ${env.MAX_UPLOAD_MB}MB`);
  }

  if (kind === 'document') {
    const isDocx = file.type === DOCX_MIME || file.name.toLowerCase().endsWith('.docx');
    if (!isDocx) {
      throw new Error('Document upload must be a DOCX file');
    }
    return;
  }

  const allowed = new Set([DOCX_MIME, PDF_MIME, TXT_MIME, 'application/octet-stream']);
  if (!allowed.has(file.type)) {
    throw new Error('Specification must be DOCX, PDF, or TXT');
  }
}

export const MimeTypes = {
  DOCX_MIME,
  PDF_MIME,
  TXT_MIME
};
