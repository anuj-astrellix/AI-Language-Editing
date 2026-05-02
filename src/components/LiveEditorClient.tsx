'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { HighlightedChange } from '@/components/HighlightedChange';

interface JobStatus {
  id: string;
  status: string;
  progressPercent: number;
  currentSegmentIndex: number;
  totalSegments: number;
  currentSectionLabel: string | null;
  errorMessage: string | null;
  editingMode: string;
  editorName: string;
  editorEmail: string;
}

interface ChangeItem {
  id: string;
  originalText: string;
  editedText: string;
  editReason: string;
  editCategory: string;
  confidenceScore: number;
  riskLevel: string;
  changedEntities: unknown;
  needsAuthorConfirmation: boolean;
  editorComment: string | null;
  editorName: string;
  editorEmail: string;
  editorTimestamp: string;
  revisionCycle: number;
  diffHtml: string;
  segment: {
    segmentIndex: number;
    sectionLabel: string | null;
    segmentKey: string;
  };
  decisions: Array<{
    decision: string;
  }>;
}

interface ActivityItem {
  id: string;
  action: string;
  detailsJson: Record<string, unknown>;
  createdAt: string;
}

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  createdAt: string;
}

interface StreamEventPayload {
  type: string;
  payload?: Record<string, unknown>;
  status?: string;
  progress?: number;
  currentSectionLabel?: string;
  currentSegmentIndex?: number;
  totalSegments?: number;
  message?: string;
  errorMessage?: string | null;
  editingMode?: string;
  editorName?: string;
  editorEmail?: string;
}

export function LiveEditorClient({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [changes, setChanges] = useState<ChangeItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [chatQuestion, setChatQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);

  const [draftByChangeId, setDraftByChangeId] = useState<Record<string, string>>({});
  const [instructionByChangeId, setInstructionByChangeId] = useState<Record<string, string>>({});

  const activeChange = useMemo(() => changes[changes.length - 1] ?? null, [changes]);

  const latestFailure = useMemo(
    () =>
      activity.find((item) =>
        ['job_failed', 'change_regeneration_failed', 'files_generation_failed'].includes(item.action)
      ) ?? null,
    [activity]
  );

  const latestFailureReason = useMemo(() => {
    if (!latestFailure) {
      return '';
    }

    const details = latestFailure.detailsJson ?? {};
    const raw = (details.error ?? details.message ?? details.reason) as unknown;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw;
    }

    return formatJson(details);
  }, [latestFailure]);

  const fetchJob = async () => {
    const response = await fetch(`/api/jobs/${jobId}`);
    const payload = (await response.json()) as { ok: boolean; data?: JobStatus; error?: { message: string } };
    if (!payload.ok || !payload.data) {
      throw new Error(payload.error?.message ?? 'Failed to fetch job');
    }

    setJob(payload.data);
  };

  const fetchChanges = async () => {
    const response = await fetch(`/api/jobs/${jobId}/changes`);
    const payload = (await response.json()) as { ok: boolean; data?: { changes: ChangeItem[] }; error?: { message: string } };
    if (!payload.ok || !payload.data) {
      throw new Error(payload.error?.message ?? 'Failed to fetch changes');
    }

    setChanges(payload.data.changes);
  };

  const fetchActivity = async () => {
    const response = await fetch(`/api/jobs/${jobId}/activity?limit=400`);
    const payload = (await response.json()) as {
      ok: boolean;
      data?: { activity: ActivityItem[] };
      error?: { message: string };
    };

    if (!payload.ok || !payload.data) {
      throw new Error(payload.error?.message ?? 'Failed to fetch activity');
    }

    setActivity(payload.data.activity);
  };

  useEffect(() => {
    setDraftByChangeId((previous) => {
      const next = { ...previous };
      for (const change of changes) {
        if (next[change.id] === undefined) {
          next[change.id] = change.editedText;
        }
      }
      return next;
    });

    setInstructionByChangeId((previous) => {
      const next = { ...previous };
      for (const change of changes) {
        if (next[change.id] === undefined) {
          next[change.id] = '';
        }
      }
      return next;
    });
  }, [changes]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        await Promise.all([fetchJob(), fetchChanges(), fetchActivity()]);
      } catch (bootstrapError) {
        if (mounted) {
          setError(bootstrapError instanceof Error ? bootstrapError.message : 'Failed to initialize live editor');
        }
      }
    };

    void bootstrap();

    const source = new EventSource(`/api/jobs/${jobId}/stream`);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as StreamEventPayload;

        const stamp = new Date().toLocaleTimeString();
        setLogs((items) => [`${stamp} - ${formatStreamEvent(payload)}`, ...items].slice(0, 120));

        if (payload.type === 'snapshot') {
          setJob((previous) => ({
            id: jobId,
            status: payload.status ?? previous?.status ?? 'PENDING',
            progressPercent: Number(payload.progress ?? previous?.progressPercent ?? 0),
            currentSegmentIndex: Number(payload.currentSegmentIndex ?? previous?.currentSegmentIndex ?? 0),
            totalSegments: Number(payload.totalSegments ?? previous?.totalSegments ?? 0),
            currentSectionLabel: (payload.currentSectionLabel ?? previous?.currentSectionLabel ?? null) as string | null,
            errorMessage: (payload.errorMessage as string | undefined) ?? previous?.errorMessage ?? null,
            editingMode: (payload.editingMode as string | undefined) ?? previous?.editingMode ?? 'SCIENTIFIC_MANUSCRIPT',
            editorName: (payload.editorName as string | undefined) ?? previous?.editorName ?? 'Meenakshi Sharma',
            editorEmail: (payload.editorEmail as string | undefined) ?? previous?.editorEmail ?? 'barthwal.meenakshi@gmail.com'
          }));
        }

        if (payload.type === 'job_progress' && payload.payload) {
          setJob((previous) =>
            previous
              ? {
                  ...previous,
                  progressPercent: Number(payload.payload?.progress ?? previous.progressPercent),
                  currentSegmentIndex: Number(payload.payload?.currentSegmentIndex ?? previous.currentSegmentIndex),
                  totalSegments: Number(payload.payload?.totalSegments ?? previous.totalSegments),
                  currentSectionLabel: (payload.payload?.currentSectionLabel ?? previous.currentSectionLabel ?? null) as string | null
                }
              : previous
          );
        }

        const refreshEverythingEvents = new Set([
          'job_started',
          'change_suggested',
          'decision_updated',
          'job_paused',
          'job_resumed',
          'job_canceled',
          'job_failed',
          'job_completed',
          'files_generated'
        ]);

        if (refreshEverythingEvents.has(payload.type)) {
          void Promise.all([fetchJob(), fetchChanges(), fetchActivity()]).catch(() => {
            // Keep stream alive even if one refresh call fails.
          });
        }
      } catch {
        setLogs((items) => [`${new Date().toLocaleTimeString()} - event parse failed`, ...items].slice(0, 120));
      }
    };

    source.onerror = () => {
      setLogs((items) => [`${new Date().toLocaleTimeString()} - stream disconnected`, ...items].slice(0, 120));
    };

    return () => {
      mounted = false;
      source.close();
    };
  }, [jobId]);

  const callJobAction = async (action: 'pause' | 'resume' | 'cancel') => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/jobs/${jobId}/${action}`, { method: 'POST' });
      const payload = (await response.json()) as { ok: boolean; error?: { message: string } };
      if (!payload.ok) {
        throw new Error(payload.error?.message ?? `Failed to ${action} job`);
      }
      await Promise.all([fetchJob(), fetchActivity()]);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const decide = async (changeId: string, decision: 'accept' | 'reject') => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/jobs/${jobId}/changes/${changeId}/${decision}`, { method: 'POST' });
      const payload = (await response.json()) as { ok: boolean; error?: { message: string } };
      if (!payload.ok) {
        throw new Error(payload.error?.message ?? `Failed to ${decision} change`);
      }
      await Promise.all([fetchChanges(), fetchActivity()]);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Decision failed');
    } finally {
      setLoading(false);
    }
  };

  const regenerate = async (
    changeId: string,
    options?: {
      seedEditedText?: string;
      instruction?: string;
    }
  ) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/jobs/${jobId}/changes/${changeId}/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          seedEditedText: options?.seedEditedText?.trim() || undefined,
          instruction: options?.instruction?.trim() || undefined
        })
      });
      const payload = (await response.json()) as { ok: boolean; error?: { message: string } };
      if (!payload.ok) {
        throw new Error(payload.error?.message ?? 'Failed to regenerate suggestion');
      }
      await Promise.all([fetchChanges(), fetchActivity()]);
    } catch (regenerateError) {
      setError(regenerateError instanceof Error ? regenerateError.message : 'Regeneration failed');
    } finally {
      setLoading(false);
    }
  };

  const decideAll = async (decision: 'accept-all' | 'reject-all') => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/jobs/${jobId}/changes/${decision}`, { method: 'POST' });
      const payload = (await response.json()) as { ok: boolean; error?: { message: string } };
      if (!payload.ok) {
        throw new Error(payload.error?.message ?? `Failed to ${decision}`);
      }
      await Promise.all([fetchChanges(), fetchActivity()]);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Decision failed');
    } finally {
      setLoading(false);
    }
  };

  const askAssistant = async () => {
    if (chatQuestion.trim().length < 3) {
      setChatError('Enter a longer question for the assistant.');
      return;
    }

    setChatLoading(true);
    setChatError('');

    try {
      const response = await fetch(`/api/jobs/${jobId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ question: chatQuestion.trim() })
      });

      const payload = (await response.json()) as {
        ok: boolean;
        data?: { messages: ChatMessageItem[] };
        error?: { message: string };
      };

      if (!payload.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Assistant request failed');
      }

      setChatMessages(payload.data.messages);
      setChatQuestion('');
      await fetchActivity();
    } catch (assistantError) {
      setChatError(assistantError instanceof Error ? assistantError.message : 'Assistant request failed');
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <>
      <div className="card">
        <p className="muted">
          Job ID: <span className="mono">{jobId}</span>
        </p>
        <p>
          Status:{' '}
          <span className={`status-pill ${job?.status === 'FAILED' ? 'danger' : job?.status === 'PAUSED' ? 'warning' : ''}`}>
            {job?.status ?? 'Loading'}
          </span>
        </p>
        <p>Mode: {formatMode(job?.editingMode ?? 'SCIENTIFIC_MANUSCRIPT')}</p>
        <p>
          Editor: <strong>{job?.editorName ?? 'Meenakshi Sharma'}</strong> ({job?.editorEmail ?? 'barthwal.meenakshi@gmail.com'})
        </p>
        <p>Current section: {job?.currentSectionLabel ?? 'N/A'}</p>

        {job?.status === 'FAILED' && job.errorMessage ? (
          <p className="job-error-banner">
            <strong>Failure reason:</strong> {job.errorMessage}
          </p>
        ) : null}

        {latestFailure ? (
          <details className="activity-item" open>
            <summary>Latest failure detail ({latestFailure.action})</summary>
            <p style={{ marginTop: '0.45rem', color: '#991b1b' }}>{latestFailureReason}</p>
            <pre className="activity-json">{formatJson(latestFailure.detailsJson)}</pre>
          </details>
        ) : null}

        <div className="progress-wrap">
          <div className="progress-bar" style={{ width: `${Math.min(job?.progressPercent ?? 0, 100)}%` }} />
        </div>

        <p className="muted">
          Progress: {(job?.progressPercent ?? 0).toFixed(2)}% ({job?.currentSegmentIndex ?? 0}/{job?.totalSegments ?? 0})
        </p>

        <div className="button-row">
          <button type="button" className="button-secondary" onClick={() => void callJobAction('pause')} disabled={loading}>
            Pause
          </button>
          <button type="button" className="button-secondary" onClick={() => void callJobAction('resume')} disabled={loading}>
            Resume
          </button>
          <button type="button" className="button-danger" onClick={() => void callJobAction('cancel')} disabled={loading}>
            Stop
          </button>
          <Link href={`/review/${jobId}`} className="btn button-success">
            Review Changes
          </Link>
          <Link href={`/export/${jobId}`} className="btn">
            Go to Export
          </Link>
        </div>

        {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Live Suggested Edit</h2>
          {!activeChange ? <p className="muted">No changes yet. Waiting for AI output...</p> : null}
          {activeChange ? (
            <>
              <p>
                <strong>Section:</strong> {activeChange.segment.sectionLabel ?? activeChange.segment.segmentKey}
              </p>
              <p>
                <strong>Category:</strong> {formatLabel(activeChange.editCategory)}
              </p>
              <p>
                <strong>Reason:</strong> {activeChange.editReason}
              </p>
              <p>
                <strong>Confidence:</strong> {(activeChange.confidenceScore * 100).toFixed(1)}%
              </p>
              <p>
                <strong>Risk:</strong>{' '}
                <span className={`status-pill ${['HIGH', 'CRITICAL'].includes(activeChange.riskLevel) ? 'danger' : ''}`}>
                  {activeChange.riskLevel}
                </span>
              </p>
              <p>
                <strong>Editor:</strong> {activeChange.editorName} ({activeChange.editorEmail})
              </p>
              <p>
                <strong>Revision cycle:</strong> {activeChange.revisionCycle}
              </p>
              <p>
                <strong>Timestamp:</strong> {formatTimestamp(activeChange.editorTimestamp)}
              </p>
              {activeChange.needsAuthorConfirmation ? (
                <p className="job-error-banner">
                  <strong>Needs author confirmation:</strong>{' '}
                  {activeChange.editorComment ?? 'Potentially ambiguous/high-risk change detected by editor.'}
                </p>
              ) : null}

              <HighlightedChange
                originalText={activeChange.originalText}
                editedText={activeChange.editedText}
                diffHtml={activeChange.diffHtml}
              />

              <label htmlFor={`live-draft-${activeChange.id}`}>AI updated document text (editable)</label>
              <textarea
                id={`live-draft-${activeChange.id}`}
                value={draftByChangeId[activeChange.id] ?? activeChange.editedText}
                onChange={(event) =>
                  setDraftByChangeId((previous) => ({
                    ...previous,
                    [activeChange.id]: event.target.value
                  }))
                }
                placeholder="Edit this AI suggestion, then regenerate for this section"
              />

              <label htmlFor={`live-instruction-${activeChange.id}`}>Section instruction (optional)</label>
              <input
                id={`live-instruction-${activeChange.id}`}
                type="text"
                value={instructionByChangeId[activeChange.id] ?? ''}
                onChange={(event) =>
                  setInstructionByChangeId((previous) => ({
                    ...previous,
                    [activeChange.id]: event.target.value
                  }))
                }
                placeholder="Example: tighten for Nature style and reduce redundancy"
              />

              <div className="button-row">
                <button
                  type="button"
                  className="button-success"
                  onClick={() => void decide(activeChange.id, 'accept')}
                  disabled={loading}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="button-danger"
                  onClick={() => void decide(activeChange.id, 'reject')}
                  disabled={loading}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() =>
                    void regenerate(activeChange.id, {
                      seedEditedText: draftByChangeId[activeChange.id] ?? activeChange.editedText,
                      instruction: instructionByChangeId[activeChange.id] ?? ''
                    })
                  }
                  disabled={loading}
                >
                  Generate From Edited Draft
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void regenerate(activeChange.id)}
                  disabled={loading}
                >
                  Suggest Another
                </button>
                <button type="button" className="button-secondary" onClick={() => void decideAll('accept-all')} disabled={loading}>
                  Accept All
                </button>
                <button type="button" className="button-secondary" onClick={() => void decideAll('reject-all')} disabled={loading}>
                  Reject All
                </button>
              </div>
            </>
          ) : null}
        </div>

        <div className="card">
          <h2>Editing Logs</h2>
          <p className="muted">Live stream events with details.</p>
          <div className="log-box">
            <ul>
              {logs.map((line, index) => (
                <li key={`${line}-${index}`} className="mono">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Document-Aware Assistant</h2>
        <p className="muted">
          Ask: Why was this changed? Make this more concise. Make this Nature-style. Check only grammar. Reduce redundancy.
        </p>
        <textarea
          value={chatQuestion}
          onChange={(event) => setChatQuestion(event.target.value)}
          placeholder="Ask about this document or request another refinement strategy"
        />
        <div className="button-row">
          <button type="button" className="button-secondary" onClick={askAssistant} disabled={chatLoading}>
            {chatLoading ? 'Thinking...' : 'Ask Assistant'}
          </button>
        </div>
        {chatError ? <p style={{ color: '#b91c1c' }}>{chatError}</p> : null}

        <div className="activity-list">
          {chatMessages.map((message) => (
            <div className="activity-item" key={message.id}>
              <div className="activity-head">
                <span className="status-pill">{message.role.toUpperCase()}</span>
                <span className="mono">{formatTimestamp(message.createdAt)}</span>
              </div>
              <p style={{ marginTop: '0.45rem', whiteSpace: 'pre-wrap' }}>{message.message}</p>
            </div>
          ))}
          {chatMessages.length === 0 ? <p className="muted">No assistant conversation yet.</p> : null}
        </div>
      </div>

      <div className="card">
        <h2>Activity Timeline</h2>
        <p className="muted">Persistent job activity including failures and reasons.</p>

        <div className="activity-list">
          {activity.map((item) => (
            <div className="activity-item" key={item.id}>
              <div className="activity-head">
                <span className="mono">{formatTimestamp(item.createdAt)}</span>
                <strong>{item.action}</strong>
              </div>
              <details>
                <summary>Details</summary>
                <pre className="activity-json">{formatJson(item.detailsJson)}</pre>
              </details>
            </div>
          ))}
          {activity.length === 0 ? <p className="muted">No activity recorded yet.</p> : null}
        </div>
      </div>

      <div className="card">
        <h2>Recent Changes</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Section</th>
              <th>Highlighted Difference</th>
              <th>Category</th>
              <th>Confidence</th>
              <th>Risk</th>
              <th>Decision</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr key={change.id}>
                <td>{change.segment.sectionLabel ?? change.segment.segmentKey}</td>
                <td>
                  <HighlightedChange
                    originalText={change.originalText}
                    editedText={change.editedText}
                    diffHtml={change.diffHtml}
                    compact
                  />
                </td>
                <td>{formatLabel(change.editCategory)}</td>
                <td>{(change.confidenceScore * 100).toFixed(1)}%</td>
                <td>{change.riskLevel}</td>
                <td>{change.decisions[0]?.decision ?? 'PENDING'}</td>
                <td>
                  <div className="button-row">
                    <button
                      type="button"
                      className="button-success"
                      onClick={() => void decide(change.id, 'accept')}
                      disabled={loading}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="button-danger"
                      onClick={() => void decide(change.id, 'reject')}
                      disabled={loading}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void regenerate(change.id)}
                      disabled={loading}
                    >
                      Suggest Another
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function formatStreamEvent(event: StreamEventPayload): string {
  if (event.type === 'job_failed') {
    return `job_failed: ${String(event.payload?.error ?? event.message ?? 'unknown error')}`;
  }

  if (event.type === 'job_progress') {
    const progress = Number(event.payload?.progress ?? 0);
    const section = String(event.payload?.currentSectionLabel ?? 'N/A');
    return `job_progress: ${progress.toFixed(2)}% (${section})`;
  }

  if (event.type === 'change_suggested') {
    const segment = String(event.payload?.sectionLabel ?? event.payload?.segmentIndex ?? 'unknown section');
    const risk = String(event.payload?.riskLevel ?? 'LOW');
    const category = String(event.payload?.editCategory ?? 'STYLE');
    return `change_suggested: ${segment} (${category}, risk=${risk})`;
  }

  if (event.type === 'decision_updated') {
    const decision = String(event.payload?.decision ?? 'PENDING');
    return `decision_updated: ${decision}`;
  }

  return event.type;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

function formatMode(value: string): string {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
