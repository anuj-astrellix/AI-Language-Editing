'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface Rule {
  id: string;
  text: string;
  category: string;
}

interface SpecUploadResponse {
  ok: boolean;
  data?: {
    specificationId: string;
    sourceType: string;
    detectedRules: Rule[];
  };
  error?: {
    message: string;
  };
}

interface StartJobResponse {
  ok: boolean;
  data?: {
    jobId: string;
    totalSegments: number;
  };
  error?: {
    message: string;
  };
}

interface OpenAiKeyStatusResponse {
  ok: boolean;
  data?: {
    configured: boolean;
    source: 'env' | 'runtime' | 'none';
    message: string;
  };
  error?: {
    message: string;
  };
}

interface EditorProfileResponse {
  ok: boolean;
  data?: {
    profile: {
      id: string;
      name: string;
      email: string;
      companyId: string | null;
      signature: string | null;
      dictionaryPreference: string;
    };
  };
  error?: {
    message: string;
  };
}

const SCIENTIFIC_EDITING_RULES = [
  'Edit for spelling, grammar, and clarity using US English conventions.',
  'Use track-changes style suggestions for every correction.',
  'Follow Merriam-Webster dictionary conventions.',
  'Use title case for title and headings.',
  'Correct sentence structure, article usage, prepositions, subject-verb agreement, and parallelism.',
  'Maintain journal-style scientific and technical language suitable for publication.',
  'Preserve scientific meaning, data values, citations, names, and technical terminology.',
  'Do not alter claims, conclusions, references, equations, or units unless explicitly instructed.'
];

const SCIENTIFIC_ADDITIONAL_PROMPT =
  'Language editing for scientific publication quality. Improve grammar, clarity, tense consistency, punctuation, and technical readability while preserving scientific intent. Mark ambiguous edits with Needs author confirmation.';

const EDITING_MODES: Array<{ value: string; label: string; description: string }> = [
  {
    value: 'GENERAL_PROFESSIONAL',
    label: 'General Professional Editing',
    description: 'General publication-ready grammar and clarity polish.'
  },
  {
    value: 'SCIENTIFIC_MANUSCRIPT',
    label: 'Scientific Manuscript Editing',
    description: 'Research article language polish aligned with scientific journal style.'
  },
  {
    value: 'TECHNICAL_RESEARCH',
    label: 'Technical Research Editing',
    description: 'Technical precision, readability, and terminology consistency.'
  },
  {
    value: 'JOURNAL_SUBMISSION',
    label: 'Journal Submission Polish',
    description: 'Final pass for submission-grade style and flow.'
  },
  {
    value: 'GRANT_PROPOSAL',
    label: 'Grant/Proposal Editing',
    description: 'Clarity and professional polish for grants and proposals.'
  }
];

export function SpecificationClient() {
  const params = useSearchParams();
  const documentId = params.get('documentId') ?? '';

  const [specFile, setSpecFile] = useState<File | null>(null);
  const [specText, setSpecText] = useState('');
  const [specificationId, setSpecificationId] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [allowMeaningChanges, setAllowMeaningChanges] = useState(false);
  const [allowProtectedEdits, setAllowProtectedEdits] = useState(false);
  const [editingMode, setEditingMode] = useState('SCIENTIFIC_MANUSCRIPT');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState('');

  const [editorName, setEditorName] = useState('Meenakshi Sharma');
  const [editorEmail, setEditorEmail] = useState('barthwal.meenakshi@gmail.com');
  const [editorCompanyId, setEditorCompanyId] = useState('');
  const [editorSignature, setEditorSignature] = useState('Meenakshi Sharma');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSavedAt, setProfileSavedAt] = useState('');

  const [openAiConfigured, setOpenAiConfigured] = useState<boolean | null>(null);
  const [openAiSource, setOpenAiSource] = useState<'env' | 'runtime' | 'none'>('none');
  const [openAiStatusMessage, setOpenAiStatusMessage] = useState('Checking OpenAI key status...');
  const [openAiKeyInput, setOpenAiKeyInput] = useState('');
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState('');

  const parsedRules = useMemo(
    () =>
      rulesText
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
    [rulesText]
  );

  const loadOpenAiStatus = async () => {
    setKeyLoading(true);
    setKeyError('');

    try {
      const response = await fetch('/api/system/openai-key');
      const payload = (await response.json()) as OpenAiKeyStatusResponse;
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Failed to fetch OpenAI key status');
      }

      setOpenAiConfigured(payload.data.configured);
      setOpenAiSource(payload.data.source);
      setOpenAiStatusMessage(payload.data.message);
    } catch (statusError) {
      setOpenAiConfigured(false);
      setOpenAiSource('none');
      setOpenAiStatusMessage('OPENAI_API_KEY is missing. Add it in .env before starting an AI editing job.');
      setKeyError(statusError instanceof Error ? statusError.message : 'Unable to check key status');
    } finally {
      setKeyLoading(false);
    }
  };

  const loadEditorProfile = async () => {
    setProfileLoading(true);
    setProfileError('');

    try {
      const response = await fetch('/api/editor-profile');
      const payload = (await response.json()) as EditorProfileResponse;
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Failed to load editor profile');
      }

      const profile = payload.data.profile;
      setEditorName(profile.name);
      setEditorEmail(profile.email);
      setEditorCompanyId(profile.companyId ?? '');
      setEditorSignature(profile.signature ?? profile.name);
    } catch (profileLoadError) {
      setProfileError(profileLoadError instanceof Error ? profileLoadError.message : 'Unable to load editor profile');
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadOpenAiStatus(), loadEditorProfile()]);
  }, []);

  const applyScientificPreset = () => {
    setRulesText(SCIENTIFIC_EDITING_RULES.join('\n'));
    setAdditionalInstructions(SCIENTIFIC_ADDITIONAL_PROMPT);
    setEditingMode('SCIENTIFIC_MANUSCRIPT');
  };

  const saveOpenAiKey = async () => {
    if (openAiKeyInput.trim().length < 20) {
      setKeyError('Enter a valid OpenAI API key.');
      return;
    }

    setKeyLoading(true);
    setKeyError('');

    try {
      const response = await fetch('/api/system/openai-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ apiKey: openAiKeyInput.trim() })
      });

      const payload = (await response.json()) as OpenAiKeyStatusResponse;
      if (!payload.ok) {
        throw new Error(payload.error?.message ?? 'Failed to save OpenAI API key');
      }

      setOpenAiKeyInput('');
      await loadOpenAiStatus();
    } catch (saveError) {
      setKeyError(saveError instanceof Error ? saveError.message : 'Unable to save key');
    } finally {
      setKeyLoading(false);
    }
  };

  const clearRuntimeKey = async () => {
    setKeyLoading(true);
    setKeyError('');

    try {
      const response = await fetch('/api/system/openai-key', {
        method: 'DELETE'
      });
      const payload = (await response.json()) as OpenAiKeyStatusResponse;
      if (!payload.ok) {
        throw new Error(payload.error?.message ?? 'Failed to clear runtime key');
      }

      await loadOpenAiStatus();
    } catch (clearError) {
      setKeyError(clearError instanceof Error ? clearError.message : 'Unable to clear runtime key');
    } finally {
      setKeyLoading(false);
    }
  };

  const saveEditorProfile = async () => {
    setProfileLoading(true);
    setProfileError('');

    try {
      const response = await fetch('/api/editor-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editorName,
          email: editorEmail,
          companyId: editorCompanyId.trim() || null,
          signature: editorSignature.trim() || null
        })
      });

      const payload = (await response.json()) as EditorProfileResponse;
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Failed to save editor profile');
      }

      setEditorName(payload.data.profile.name);
      setEditorEmail(payload.data.profile.email);
      setEditorCompanyId(payload.data.profile.companyId ?? '');
      setEditorSignature(payload.data.profile.signature ?? payload.data.profile.name);
      setProfileSavedAt(new Date().toLocaleTimeString());
    } catch (profileSaveError) {
      setProfileError(profileSaveError instanceof Error ? profileSaveError.message : 'Unable to save profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const uploadSpecification = async () => {
    if (!documentId) {
      setError('Document ID missing. Return to upload page first.');
      return;
    }

    if (!specFile && specText.trim().length === 0) {
      setError('Upload a spec file or paste instructions.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const form = new FormData();
      if (specFile) {
        form.append('file', specFile);
      }
      if (specText.trim()) {
        form.append('text', specText.trim());
      }
      form.append('documentId', documentId);

      const response = await fetch('/api/specifications/upload', {
        method: 'POST',
        body: form
      });
      const payload = (await response.json()) as SpecUploadResponse;
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Specification upload failed');
      }

      setSpecificationId(payload.data.specificationId);
      setRulesText(payload.data.detectedRules.map((rule) => rule.text).join('\n'));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload specification');
    } finally {
      setLoading(false);
    }
  };

  const persistRules = async () => {
    if (!specificationId || parsedRules.length === 0) {
      throw new Error('No specification rules to save');
    }

    const response = await fetch(`/api/specifications/${specificationId}/rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ rules: parsedRules })
    });
    const payload = (await response.json()) as { ok: boolean; error?: { message: string } };
    if (!payload.ok) {
      throw new Error(payload.error?.message ?? 'Failed to save rules');
    }
  };

  const saveRules = async () => {
    setLoading(true);
    setError('');

    try {
      await persistRules();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save rules');
    } finally {
      setLoading(false);
    }
  };

  const startJob = async () => {
    if (!documentId || !specificationId) {
      setError('Upload both document and specification before starting a job.');
      return;
    }

    if (!openAiConfigured) {
      setError('OPENAI_API_KEY is missing. Add it in .env before starting an AI editing job.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await Promise.all([persistRules(), saveEditorProfile()]);

      const response = await fetch('/api/jobs/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentId,
          specificationId,
          allowMeaningChanges,
          allowProtectedEdits,
          editingMode,
          additionalInstructions: additionalInstructions.trim() || undefined
        })
      });

      const payload = (await response.json()) as StartJobResponse;
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Failed to start job');
      }

      setJobId(payload.data.jobId);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Failed to start job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="card">
        <h2>OpenAI Key Setup</h2>
        <p className="muted">
          {openAiStatusMessage}{' '}
          {openAiSource !== 'none' ? <span className="status-pill">source: {openAiSource}</span> : null}
        </p>

        {openAiConfigured ? (
          <p className="status-ok-text">OpenAI editing is enabled.</p>
        ) : (
          <>
            <label htmlFor="openai-key">OpenAI API Key</label>
            <input
              id="openai-key"
              type="password"
              value={openAiKeyInput}
              onChange={(event) => setOpenAiKeyInput(event.target.value)}
              placeholder="sk-..."
              autoComplete="off"
            />
            <p className="muted">Saved server-side for this local app session data store.</p>
            <div className="button-row">
              <button type="button" className="button-success" onClick={saveOpenAiKey} disabled={keyLoading}>
                {keyLoading ? 'Saving...' : 'Save API Key'}
              </button>
              <button type="button" className="button-secondary" onClick={() => void loadOpenAiStatus()} disabled={keyLoading}>
                Refresh Status
              </button>
            </div>
          </>
        )}

        {openAiSource === 'runtime' ? (
          <div className="button-row">
            <button type="button" className="button-danger" onClick={clearRuntimeKey} disabled={keyLoading}>
              Clear Runtime Key
            </button>
          </div>
        ) : null}

        {keyError ? <p style={{ color: '#b91c1c' }}>{keyError}</p> : null}
      </div>

      <div className="card">
        <h2>Editor Profile</h2>
        <p className="muted">Every tracked correction carries this editor attribution.</p>

        <label htmlFor="editor-name">Editor Name</label>
        <input id="editor-name" type="text" value={editorName} onChange={(event) => setEditorName(event.target.value)} />

        <label htmlFor="editor-email">Editor Email/ID</label>
        <input id="editor-email" type="text" value={editorEmail} onChange={(event) => setEditorEmail(event.target.value)} />

        <label htmlFor="editor-company">Company ID (optional)</label>
        <input id="editor-company" type="text" value={editorCompanyId} onChange={(event) => setEditorCompanyId(event.target.value)} />

        <label htmlFor="editor-signature">Signature (optional)</label>
        <textarea
          id="editor-signature"
          value={editorSignature}
          onChange={(event) => setEditorSignature(event.target.value)}
          placeholder="Signature used in reports and comments"
        />

        <p className="muted">Dictionary profile: Merriam-Webster (US English).</p>

        <div className="button-row">
          <button type="button" className="button-secondary" onClick={saveEditorProfile} disabled={profileLoading}>
            {profileLoading ? 'Saving profile...' : 'Save Editor Profile'}
          </button>
          <button type="button" className="button-secondary" onClick={() => void loadEditorProfile()} disabled={profileLoading}>
            Reload Profile
          </button>
        </div>

        {profileSavedAt ? <p className="status-ok-text">Profile saved at {profileSavedAt}</p> : null}
        {profileError ? <p style={{ color: '#b91c1c' }}>{profileError}</p> : null}
      </div>

      <div className="card">
        <p className="muted">Document ID: {documentId ? <span className="mono">{documentId}</span> : 'Not provided'}</p>
        {documentId ? (
          <div className="button-row">
            <button
              type="button"
              className="button-secondary"
              onClick={() => window.open(`/api/documents/${documentId}/preview?version=original`, '_blank', 'noopener,noreferrer')}
            >
              Preview Original Document
            </button>
          </div>
        ) : null}

        <label htmlFor="spec-file">Specification File (DOCX/PDF/TXT)</label>
        <input id="spec-file" type="file" onChange={(event) => setSpecFile(event.target.files?.[0] ?? null)} />

        <p className="muted">or paste specification text</p>
        <textarea
          value={specText}
          onChange={(event) => setSpecText(event.target.value)}
          placeholder="Enter editing rules, tone requirements, protected terms, and style instructions"
        />

        <div className="button-row">
          <button type="button" onClick={uploadSpecification} disabled={loading}>
            {loading ? 'Processing...' : 'Extract Rules'}
          </button>
        </div>

        {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
      </div>

      <div className="card">
        <h2>Editing Configuration</h2>

        <label htmlFor="editing-mode">Editing Mode</label>
        <select id="editing-mode" value={editingMode} onChange={(event) => setEditingMode(event.target.value)}>
          {EDITING_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
        <p className="muted">{EDITING_MODES.find((mode) => mode.value === editingMode)?.description ?? ''}</p>

        <h2>Detected Editing Rules</h2>
        <p className="muted">Edit rules manually before starting the job. One rule per line.</p>
        <textarea value={rulesText} onChange={(event) => setRulesText(event.target.value)} />

        <div className="button-row">
          <button type="button" className="button-secondary" onClick={applyScientificPreset} disabled={loading}>
            Apply Scientific Preset
          </button>
        </div>

        <label htmlFor="additional-instructions">Additional Prompt Instructions</label>
        <textarea
          id="additional-instructions"
          value={additionalInstructions}
          onChange={(event) => setAdditionalInstructions(event.target.value)}
          placeholder="Add more instructions for AI editing beyond extracted rules"
        />

        <div className="button-row">
          <label>
            <input
              type="checkbox"
              checked={allowMeaningChanges}
              onChange={(event) => setAllowMeaningChanges(event.target.checked)}
            />{' '}
            Allow meaning changes (disabled by default)
          </label>
          <label>
            <input
              type="checkbox"
              checked={allowProtectedEdits}
              onChange={(event) => setAllowProtectedEdits(event.target.checked)}
            />{' '}
            Allow protected/non-editable sections
          </label>
        </div>

        <div className="button-row">
          <button type="button" className="button-secondary" onClick={saveRules} disabled={!specificationId || loading}>
            Save Rules
          </button>
          <button
            type="button"
            className="button-success"
            onClick={startJob}
            disabled={!specificationId || loading || openAiConfigured !== true}
          >
            Start Editing Job
          </button>
        </div>

        {openAiConfigured === false ? <p className="muted">Start is disabled until OpenAI API key is configured.</p> : null}

        {jobId ? (
          <div style={{ marginTop: '0.8rem' }}>
            <p>
              Job started: <span className="mono">{jobId}</span>
            </p>
            <Link href={`/live/${jobId}`} className="btn">
              Open Live Editor
            </Link>
            <button
              type="button"
              className="button-secondary"
              onClick={() => window.open(`/api/documents/${documentId}/preview?version=edited`, '_blank', 'noopener,noreferrer')}
            >
              Preview Edited Version
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
