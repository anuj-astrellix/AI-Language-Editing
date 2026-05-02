import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

import { MimeTypes } from '@/lib/security/uploadValidation';

export async function extractSpecificationText(
  file: File | null,
  pastedText: string | null
): Promise<{ sourceType: 'TEXT' | 'DOCX' | 'PDF' | 'TXT'; rawText: string; extractedText: string }> {
  if (pastedText && pastedText.trim().length > 0) {
    return {
      sourceType: 'TEXT',
      rawText: pastedText,
      extractedText: pastedText
    };
  }

  if (!file) {
    throw new Error('Specification input is required');
  }

  const buffer = await fileToBuffer(file);
  const normalizedName = file.name.toLowerCase();
  const isDocx = file.type === MimeTypes.DOCX_MIME || normalizedName.endsWith('.docx');
  const isPdf = file.type === MimeTypes.PDF_MIME || normalizedName.endsWith('.pdf');

  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer });
    return {
      sourceType: 'DOCX',
      rawText: result.value,
      extractedText: result.value
    };
  }

  if (isPdf) {
    const result = await pdfParse(buffer);
    return {
      sourceType: 'PDF',
      rawText: result.text,
      extractedText: result.text
    };
  }

  const text = buffer.toString('utf-8');
  return {
    sourceType: 'TXT',
    rawText: text,
    extractedText: text
  };
}

async function fileToBuffer(file: File): Promise<Buffer> {
  const candidate = file as File & {
    arrayBuffer?: () => Promise<ArrayBuffer>;
    text?: () => Promise<string>;
    stream?: () => ReadableStream<Uint8Array>;
  };

  if (typeof candidate.arrayBuffer === 'function') {
    const bytes = await candidate.arrayBuffer();
    return Buffer.from(bytes);
  }

  if (typeof candidate.text === 'function') {
    const text = await candidate.text();
    return Buffer.from(text, 'utf-8');
  }

  if (typeof candidate.stream === 'function') {
    const stream = candidate.stream();
    return streamToBuffer(stream);
  }

  if (typeof FileReader !== 'undefined') {
    const text = await readWithFileReader(file);
    return Buffer.from(text, 'utf-8');
  }

  throw new Error('Unable to read specification file bytes');
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (value) {
      chunks.push(Buffer.from(value));
    }
  }

  return Buffer.concat(chunks);
}

function readWithFileReader(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(reader.error ?? new Error('Unable to read specification file'));
    };

    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
        return;
      }

      if (result instanceof ArrayBuffer) {
        resolve(Buffer.from(result).toString('utf-8'));
        return;
      }

      reject(new Error('Unexpected FileReader result type'));
    };

    reader.readAsText(file as Blob);
  });
}
