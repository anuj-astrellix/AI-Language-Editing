'use client';

import Link from 'next/link';
import { useState } from 'react';

interface UploadResponse {
  ok: boolean;
  data?: {
    documentId: string;
    filename: string;
    size: number;
  };
  error?: {
    message: string;
  };
}

export function UploadDocumentClient() {
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a DOCX file');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const form = new FormData();
      form.append('file', file);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: form
      });

      const payload = (await response.json()) as UploadResponse;
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Upload failed');
      }

      setDocumentId(payload.data.documentId);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <label htmlFor="doc-upload">DOCX Document</label>
      <input
        id="doc-upload"
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
        }}
      />

      <div className="button-row">
        <button type="button" onClick={handleUpload} disabled={loading}>
          {loading ? 'Uploading...' : 'Upload Document'}
        </button>
      </div>

      {error ? <p className="muted" style={{ color: '#b91c1c' }}>{error}</p> : null}

      {documentId ? (
        <div style={{ marginTop: '0.8rem' }}>
          <p>
            Uploaded successfully. Document ID: <span className="mono">{documentId}</span>
          </p>
          <Link href={`/specification?documentId=${documentId}`} className="btn button-success">
            Continue to Specification
          </Link>
        </div>
      ) : null}
    </div>
  );
}
