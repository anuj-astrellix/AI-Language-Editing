'use client';

import { useState } from 'react';

const downloadTypes = [
  { key: 'clean', label: 'Download Clean DOCX' },
  { key: 'comparison', label: 'Download Track Changes DOCX' },
  { key: 'changelog', label: 'Download PDF Change Log' },
  { key: 'preview', label: 'Download HTML Preview' },
  { key: 'audit', label: 'Download JSON Audit Log' }
];

export function ExportClient({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateFiles = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/jobs/${jobId}/generate`, { method: 'POST' });
      const payload = (await response.json()) as { ok: boolean; error?: { message: string } };
      if (!payload.ok) {
        throw new Error(payload.error?.message ?? 'Failed to generate outputs');
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <p className="muted">
        Generate and download final artifacts for job <span className="mono">{jobId}</span>.
      </p>

      <div className="button-row">
        <button type="button" onClick={generateFiles} disabled={loading}>
          {loading ? 'Generating...' : 'Generate Latest Outputs'}
        </button>
      </div>

      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}

      <div className="button-row">
        {downloadTypes.map((item) => (
          <button
            key={item.key}
            type="button"
            className="button-secondary"
            onClick={() => window.open(`/api/jobs/${jobId}/download?type=${item.key}`, '_blank', 'noopener,noreferrer')}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
