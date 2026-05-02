'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface JobRecord {
  id: string;
  status: string;
  progressPercent: number;
  editingMode: string;
  editorName: string;
  editorEmail: string;
  createdAt: string;
  updatedAt: string;
  document: {
    originalFilename: string;
  };
  specification: {
    sourceType: string;
  };
}

export function JobHistoryClient() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/jobs');
        const payload = (await response.json()) as { ok: boolean; data?: { jobs: JobRecord[] }; error?: { message: string } };
        if (!payload.ok || !payload.data) {
          throw new Error(payload.error?.message ?? 'Failed to fetch job history');
        }

        setJobs(payload.data.jobs);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load job history');
      }
    };

    void load();
  }, []);

  return (
    <div className="card">
      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Job ID</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Mode</th>
            <th>Editor</th>
            <th>Document</th>
            <th>Specification</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td className="mono">{job.id.slice(0, 8)}...</td>
              <td>{job.status}</td>
              <td>{job.progressPercent.toFixed(2)}%</td>
              <td>{formatMode(job.editingMode)}</td>
              <td>
                {job.editorName}
                <br />
                <span className="muted">{job.editorEmail}</span>
              </td>
              <td>{job.document.originalFilename}</td>
              <td>{job.specification.sourceType}</td>
              <td>{new Date(job.createdAt).toLocaleString()}</td>
              <td>
                <div className="button-row">
                  <Link href={`/live/${job.id}`} className="btn button-secondary">
                    Live
                  </Link>
                  <Link href={`/review/${job.id}`} className="btn button-secondary">
                    Review
                  </Link>
                  <Link href={`/export/${job.id}`} className="btn button-secondary">
                    Export
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatMode(value: string): string {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
