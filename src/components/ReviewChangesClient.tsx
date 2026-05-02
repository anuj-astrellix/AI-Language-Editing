'use client';

import { useEffect, useMemo, useState } from 'react';

import { HighlightedChange } from '@/components/HighlightedChange';

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

export function ReviewChangesClient({ jobId }: { jobId: string }) {
  const [changes, setChanges] = useState<ChangeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [decisionFilter, setDecisionFilter] = useState('ALL');

  const [draftByChangeId, setDraftByChangeId] = useState<Record<string, string>>({});
  const [instructionByChangeId, setInstructionByChangeId] = useState<Record<string, string>>({});

  const highRiskCount = useMemo(
    () => changes.filter((change) => ['HIGH', 'CRITICAL'].includes(change.riskLevel)).length,
    [changes]
  );

  const filteredChanges = useMemo(() => {
    return changes.filter((change) => {
      const decision = change.decisions[0]?.decision ?? 'PENDING';
      const haystack = [
        change.segment.sectionLabel ?? change.segment.segmentKey,
        change.originalText,
        change.editedText,
        change.editReason,
        change.editorComment ?? ''
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = search.trim().length === 0 || haystack.includes(search.trim().toLowerCase());
      const matchesCategory = categoryFilter === 'ALL' || change.editCategory === categoryFilter;
      const matchesRisk = riskFilter === 'ALL' || change.riskLevel === riskFilter;
      const matchesDecision = decisionFilter === 'ALL' || decision === decisionFilter;

      return matchesSearch && matchesCategory && matchesRisk && matchesDecision;
    });
  }, [changes, search, categoryFilter, riskFilter, decisionFilter]);

  const categories = useMemo(() => {
    return Array.from(new Set(changes.map((change) => change.editCategory))).sort();
  }, [changes]);

  const load = async () => {
    const response = await fetch(`/api/jobs/${jobId}/changes`);
    const payload = (await response.json()) as { ok: boolean; data?: { changes: ChangeItem[] }; error?: { message: string } };
    if (!payload.ok || !payload.data) {
      throw new Error(payload.error?.message ?? 'Failed to fetch changes');
    }

    setChanges(payload.data.changes);
  };

  useEffect(() => {
    void load().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load changes');
    });
  }, [jobId]);

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

  const applyDecision = async (changeId: string, decision: 'accept' | 'reject') => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/jobs/${jobId}/changes/${changeId}/${decision}`, { method: 'POST' });
      const payload = (await response.json()) as { ok: boolean; error?: { message: string } };
      if (!payload.ok) {
        throw new Error(payload.error?.message ?? `Failed to ${decision} change`);
      }
      await load();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Decision request failed');
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
      await load();
    } catch (regenerateError) {
      setError(regenerateError instanceof Error ? regenerateError.message : 'Regeneration request failed');
    } finally {
      setLoading(false);
    }
  };

  const applyAll = async (decision: 'accept-all' | 'reject-all') => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/jobs/${jobId}/changes/${decision}`, { method: 'POST' });
      const payload = (await response.json()) as { ok: boolean; error?: { message: string } };
      if (!payload.ok) {
        throw new Error(payload.error?.message ?? `Failed to ${decision}`);
      }
      await load();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Decision request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="card">
        <p>
          Total suggestions: {changes.length}. High-risk suggestions:{' '}
          <span className={`status-pill ${highRiskCount > 0 ? 'danger' : ''}`}>{highRiskCount}</span>
        </p>
        <p className="muted">
          High-risk warnings indicate potential changes to numbers, dates, legal wording, names, financial values, or citations.
        </p>

        <div className="grid two">
          <div>
            <label htmlFor="search-edits">Search edits</label>
            <input
              id="search-edits"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by section, reason, text, or query"
            />
          </div>
          <div>
            <label htmlFor="category-filter">Filter by category</label>
            <select id="category-filter" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="ALL">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {formatLabel(category)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="risk-filter">Filter by risk</label>
            <select id="risk-filter" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
              <option value="ALL">All risks</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <div>
            <label htmlFor="decision-filter">Filter by decision</label>
            <select id="decision-filter" value={decisionFilter} onChange={(event) => setDecisionFilter(event.target.value)}>
              <option value="ALL">All decisions</option>
              <option value="PENDING">PENDING</option>
              <option value="ACCEPTED">ACCEPTED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>
        </div>

        <div className="button-row">
          <button type="button" className="button-success" onClick={() => void applyAll('accept-all')} disabled={loading}>
            Accept All
          </button>
          <button type="button" className="button-danger" onClick={() => void applyAll('reject-all')} disabled={loading}>
            Reject All
          </button>
        </div>

        <p className="muted">Showing {filteredChanges.length} of {changes.length} changes.</p>

        {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
      </div>

      {filteredChanges.map((change) => (
        <article className="card" key={change.id}>
          <p>
            <strong>Section:</strong> {change.segment.sectionLabel ?? change.segment.segmentKey}
          </p>
          <p>
            <strong>Category:</strong> {formatLabel(change.editCategory)}
          </p>
          <p>
            <strong>Confidence:</strong> {(change.confidenceScore * 100).toFixed(1)}%
          </p>
          <p>
            <strong>Risk:</strong>{' '}
            <span className={`status-pill ${['HIGH', 'CRITICAL'].includes(change.riskLevel) ? 'danger' : ''}`}>
              {change.riskLevel}
            </span>
          </p>
          <p>
            <strong>Reason:</strong> {change.editReason}
          </p>
          <p>
            <strong>Decision:</strong> {change.decisions[0]?.decision ?? 'PENDING'}
          </p>
          <p>
            <strong>Editor:</strong> {change.editorName} ({change.editorEmail})
          </p>
          <p>
            <strong>Timestamp:</strong> {new Date(change.editorTimestamp).toLocaleString()}
          </p>
          <p>
            <strong>Revision cycle:</strong> {change.revisionCycle}
          </p>

          {change.needsAuthorConfirmation ? (
            <p className="job-error-banner">
              <strong>Needs author confirmation:</strong> {change.editorComment ?? 'Ambiguous or high-risk wording.'}
            </p>
          ) : null}

          <HighlightedChange originalText={change.originalText} editedText={change.editedText} diffHtml={change.diffHtml} />

          <label htmlFor={`review-draft-${change.id}`}>AI updated document text (editable)</label>
          <textarea
            id={`review-draft-${change.id}`}
            value={draftByChangeId[change.id] ?? change.editedText}
            onChange={(event) =>
              setDraftByChangeId((previous) => ({
                ...previous,
                [change.id]: event.target.value
              }))
            }
            placeholder="Edit this suggestion and regenerate for this section"
          />

          <label htmlFor={`review-instruction-${change.id}`}>Section instruction (optional)</label>
          <input
            id={`review-instruction-${change.id}`}
            type="text"
            value={instructionByChangeId[change.id] ?? ''}
            onChange={(event) =>
              setInstructionByChangeId((previous) => ({
                ...previous,
                [change.id]: event.target.value
              }))
            }
            placeholder="Example: make this tighter and more publication-ready"
          />

          <div className="button-row">
            <button
              type="button"
              className="button-success"
              onClick={() => void applyDecision(change.id, 'accept')}
              disabled={loading}
            >
              Accept
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={() => void applyDecision(change.id, 'reject')}
              disabled={loading}
            >
              Reject
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() =>
                void regenerate(change.id, {
                  seedEditedText: draftByChangeId[change.id] ?? change.editedText,
                  instruction: instructionByChangeId[change.id] ?? ''
                })
              }
              disabled={loading}
            >
              Generate From Edited Draft
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
        </article>
      ))}
    </>
  );
}

function formatLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
