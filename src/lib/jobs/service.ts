import { chatWithDocumentAssistant } from '@/lib/ai/editorClient';
import { env } from '@/lib/config';
import { extractDocxSegments } from '@/lib/docx/extractor';
import { generateJobArtifacts } from '@/lib/jobs/exporter';
import { jobEventBus } from '@/lib/jobs/eventBus';
import { editingQueue } from '@/lib/jobs/queue';
import { buildInlineDiffHtml, containsHighRiskEntity, inferHighRiskFromTextDelta } from '@/lib/review/diff';
import { generateSuggestion } from '@/lib/jobs/suggestionEngine';
import { logAudit } from '@/lib/jobs/audit';
import {
  appendChatMessage,
  createEditingJob,
  getActiveEditorProfile,
  getChangeForJob,
  getDocument,
  getGeneratedFile,
  getJobDetails,
  getJobForRuntime,
  getOrCreateChatSession,
  getSpecification,
  listAuditLogs,
  listChanges,
  listChatMessages,
  listJobs,
  listSegments,
  markDocumentCompleted,
  replaceSuggestedChange,
  setAllDecisions,
  setDecision,
  setJobStatus,
  updateSpecificationRules
} from '@/lib/jobs/repository';
import { DecisionType, EditCategory, EditingMode, GeneratedFileType, JobStatus, RiskLevel } from '@/lib/jobs/types';
import { readStoredFile } from '@/lib/storage/objectStorage';
import { hasOpenAiApiKeyConfigured } from '@/lib/server/runtimeSecrets';

function parseSpecRules(rulesJson: unknown): string[] {
  if (!Array.isArray(rulesJson)) {
    return [];
  }

  return rulesJson
    .map((rule) => {
      if (typeof rule === 'string') {
        return rule;
      }
      if (rule && typeof rule === 'object' && 'text' in rule) {
        return String((rule as { text: unknown }).text);
      }
      return '';
    })
    .filter(Boolean);
}

function buildAdditionalRequestNote(base: string, additionalInstructions?: string | null): string {
  const trimmed = additionalInstructions?.trim();
  if (!trimmed) {
    return base;
  }

  return `${base}\nAdditional user instructions:\n${trimmed}`;
}

function normalizeEditingMode(value: EditingMode | undefined): EditingMode {
  if (!value) {
    return EditingMode.SCIENTIFIC_MANUSCRIPT;
  }

  if (Object.values(EditingMode).includes(value)) {
    return value;
  }

  return EditingMode.SCIENTIFIC_MANUSCRIPT;
}

interface RegenerateSuggestionOptions {
  seedEditedText?: string;
  instruction?: string;
}

export async function startEditingJob(input: {
  documentId: string;
  specificationId: string;
  allowMeaningChanges?: boolean;
  allowProtectedEdits?: boolean;
  model?: string;
  editingMode?: EditingMode;
  additionalInstructions?: string;
  userId?: string;
}) {
  if (!(await hasOpenAiApiKeyConfigured())) {
    throw new Error('OPENAI_API_KEY is missing. Add it in .env before starting an AI editing job.');
  }

  const documentJobContext = await getDocument(input.documentId);
  if (!documentJobContext) {
    throw new Error('Document not found');
  }
  const specification = await getSpecification(input.specificationId);
  if (!specification) {
    throw new Error('Specification not found');
  }
  if (specification.documentId && specification.documentId !== input.documentId) {
    throw new Error('Specification is linked to a different document');
  }
  const sourceDoc = await readStoredFile(documentJobContext.storagePath);

  const parsed = await extractDocxSegments(sourceDoc);
  const editorProfile = await getActiveEditorProfile(input.userId);
  const editingMode = normalizeEditingMode(input.editingMode);

  const job = await createEditingJob({
    documentId: input.documentId,
    specificationId: input.specificationId,
    model: input.model ?? env.AI_MODEL,
    editingMode,
    allowMeaningChanges: input.allowMeaningChanges ?? false,
    allowProtectedEdits: input.allowProtectedEdits ?? false,
    additionalInstructions: input.additionalInstructions,
    editorProfileId: editorProfile.id,
    editorName: editorProfile.name,
    editorEmail: editorProfile.email,
    editorCompanyId: editorProfile.companyId ?? null,
    editorSignature: editorProfile.signature ?? null,
    segments: parsed.segments,
    userId: input.userId
  });

  await logAudit(
    'job_created',
    {
      documentId: input.documentId,
      specificationId: input.specificationId,
      totalSegments: parsed.segments.length,
      allowMeaningChanges: input.allowMeaningChanges ?? false,
      allowProtectedEdits: input.allowProtectedEdits ?? false,
      hasAdditionalInstructions: Boolean(input.additionalInstructions?.trim()),
      editingMode,
      editorName: editorProfile.name,
      editorEmail: editorProfile.email
    },
    job.id,
    input.userId
  );

  editingQueue.enqueue(job.id);

  return {
    jobId: job.id,
    totalSegments: parsed.segments.length,
    editingMode,
    editorName: editorProfile.name,
    editorEmail: editorProfile.email
  };
}

export async function pauseEditingJob(jobId: string, userId?: string): Promise<void> {
  const job = await getJobDetails(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  if (job.status !== JobStatus.RUNNING) {
    return;
  }

  await setJobStatus(jobId, JobStatus.PAUSED);
  await logAudit('job_paused', {}, jobId, userId);

  jobEventBus.publish({
    type: 'job_paused',
    jobId,
    timestamp: new Date().toISOString(),
    payload: {}
  });
}

export async function resumeEditingJob(jobId: string, userId?: string): Promise<void> {
  const job = await getJobDetails(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  if (job.status !== JobStatus.PAUSED && job.status !== JobStatus.PENDING) {
    return;
  }

  await setJobStatus(jobId, JobStatus.RUNNING);
  await logAudit('job_resumed', {}, jobId, userId);

  jobEventBus.publish({
    type: 'job_resumed',
    jobId,
    timestamp: new Date().toISOString(),
    payload: {}
  });

  editingQueue.enqueue(jobId);
}

export async function cancelEditingJob(jobId: string, userId?: string): Promise<void> {
  const job = await getJobDetails(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED || job.status === JobStatus.CANCELED) {
    return;
  }

  await setJobStatus(jobId, JobStatus.CANCELED, {
    finishedAt: new Date()
  });

  await logAudit('job_canceled', {}, jobId, userId);

  jobEventBus.publish({
    type: 'job_canceled',
    jobId,
    timestamp: new Date().toISOString(),
    payload: {}
  });
}

export async function getJobStatus(jobId: string) {
  const job = await getJobDetails(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  return job;
}

export async function getJobActivity(jobId: string, limit = 250) {
  const job = await getJobDetails(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  return listAuditLogs(jobId, limit);
}

export async function getSegments(jobId: string) {
  return listSegments(jobId);
}

export async function getChanges(jobId: string) {
  return listChanges(jobId);
}

export async function askDocumentAssistant(jobId: string, question: string, userId?: string) {
  const trimmedQuestion = question.trim();
  if (trimmedQuestion.length < 3) {
    throw new Error('Question must be at least 3 characters long');
  }

  if (!(await hasOpenAiApiKeyConfigured())) {
    throw new Error('OPENAI_API_KEY is missing. Add it in .env before starting an AI editing job.');
  }

  const runtime = await getJobForRuntime(jobId);
  if (!runtime) {
    throw new Error('Job not found');
  }

  const specRules = parseSpecRules(runtime.specification.rulesJson);
  const changes = await listChanges(jobId);

  const currentIndex = Math.max(0, runtime.currentSegmentIndex - 1);
  const excerptSegments = runtime.segments.slice(Math.max(0, currentIndex - 2), Math.min(runtime.segments.length, currentIndex + 3));
  const excerptText = excerptSegments
    .map((segment) => `${segment.sectionLabel ?? segment.segmentKey}: ${segment.text}`)
    .join('\n\n')
    .slice(0, 6000);

  const session = await getOrCreateChatSession(jobId);
  await appendChatMessage({
    chatSessionId: session.id,
    role: 'user',
    message: trimmedQuestion
  });

  const answer = await chatWithDocumentAssistant({
    question: trimmedQuestion,
    editingMode: runtime.editingMode,
    editorName: runtime.editorName,
    editorEmail: runtime.editorEmail,
    specRules,
    documentExcerpt: excerptText,
    recentChanges: changes.slice(0, 12).map((change) => ({
      section: change.segment.sectionLabel ?? change.segment.segmentKey,
      originalText: change.originalText,
      editedText: change.editedText,
      reason: change.editReason,
      category: change.editCategory,
      confidence: change.confidenceScore
    }))
  });

  await appendChatMessage({
    chatSessionId: session.id,
    role: 'assistant',
    message: answer
  });

  await logAudit(
    'assistant_chat',
    {
      chatSessionId: session.id,
      question: trimmedQuestion,
      answerPreview: answer.slice(0, 500)
    },
    jobId,
    userId
  );

  const messages = await listChatMessages(session.id, 40);

  return {
    chatSessionId: session.id,
    answer,
    messages
  };
}

export async function regenerateChangeSuggestion(
  jobId: string,
  changeId: string,
  userId?: string,
  options?: RegenerateSuggestionOptions
) {
  if (!(await hasOpenAiApiKeyConfigured())) {
    throw new Error('OPENAI_API_KEY is missing. Add it in .env before regenerating suggestions.');
  }

  const runtime = await getJobForRuntime(jobId);
  if (!runtime) {
    throw new Error('Job not found');
  }

  const existingChange = await getChangeForJob(jobId, changeId);
  if (!existingChange) {
    throw new Error('Change not found');
  }

  const segment = existingChange.segment;
  if (!segment.isEditable || (segment.isProtected && !runtime.allowProtectedEdits)) {
    throw new Error('This section is not editable with current job settings.');
  }

  const seedEditedText = options?.seedEditedText?.trim();
  const instruction = options?.instruction?.trim();
  const seedPreview = seedEditedText ? seedEditedText.slice(0, 6000) : undefined;

  await logAudit(
    'change_regeneration_requested',
    {
      changeId,
      segmentId: segment.id,
      segmentIndex: segment.segmentIndex,
      sectionLabel: segment.sectionLabel,
      hasSeedEditedText: Boolean(seedEditedText),
      hasInstruction: Boolean(instruction)
    },
    jobId,
    userId
  );

  try {
    const rules = parseSpecRules(runtime.specification.rulesJson);

    const baseRegenerationRequest =
      'Provide a new alternative revision for this same segment. Keep the same factual and legal meaning unless explicit rules allow meaning changes.';
    const noteParts = [baseRegenerationRequest];

    if (instruction) {
      noteParts.push(`Reviewer focus instruction: ${instruction}`);
    }

    if (seedPreview) {
      noteParts.push(`User-edited candidate draft to refine:
${seedPreview}`);
    }

    const aiResponse = await generateSuggestion({
      specRules: rules,
      segmentText: segment.text,
      contextBefore: segment.contextBefore ?? '',
      contextAfter: segment.contextAfter ?? '',
      allowMeaningChanges: runtime.allowMeaningChanges,
      allowProtectedEdits: runtime.allowProtectedEdits,
      editingMode: runtime.editingMode,
      editorName: runtime.editorName,
      editorEmail: runtime.editorEmail,
      avoidEditedTexts: [existingChange.editedText, existingChange.originalText, ...(seedEditedText ? [seedEditedText] : [])],
      requireNonIdentical: true,
      requestNote: buildAdditionalRequestNote(noteParts.join('\n\n'), runtime.additionalInstructions),
      maxAttempts: 4
    });

    const changedEntities = aiResponse.changed_entities ?? [];
    const highRisk =
      containsHighRiskEntity(changedEntities) || inferHighRiskFromTextDelta(aiResponse.original_text, aiResponse.edited_text);
    const riskLevel = highRisk && aiResponse.risk_level === 'LOW' ? 'HIGH' : aiResponse.risk_level;
    const needsAuthorConfirmation = Boolean(aiResponse.needs_author_confirmation) || (aiResponse.editor_query ?? '').trim().length > 0;

    const updatedChange = await replaceSuggestedChange({
      jobId,
      changeId,
      originalText: aiResponse.original_text,
      editedText: aiResponse.edited_text,
      editReason: aiResponse.edit_reason,
      editCategory: aiResponse.edit_category as EditCategory,
      confidenceScore: aiResponse.confidence_score,
      riskLevel: riskLevel as RiskLevel,
      changedEntities,
      needsAuthorConfirmation,
      editorComment: aiResponse.editor_query ?? null,
      editorName: runtime.editorName,
      editorEmail: runtime.editorEmail,
      editorTimestamp: new Date().toISOString(),
      diffHtml: buildInlineDiffHtml(aiResponse.original_text, aiResponse.edited_text)
    });

    await logAudit(
      'change_regenerated',
      {
        changeId,
        segmentId: segment.id,
        segmentIndex: segment.segmentIndex,
        riskLevel: riskLevel as RiskLevel,
        highRisk,
        editCategory: aiResponse.edit_category,
        confidenceScore: aiResponse.confidence_score,
        needsAuthorConfirmation,
        hasSeedEditedText: Boolean(seedEditedText),
        hasInstruction: Boolean(instruction)
      },
      jobId,
      userId
    );

    jobEventBus.publish({
      type: 'change_suggested',
      jobId,
      timestamp: new Date().toISOString(),
      payload: {
        changeId,
        segmentIndex: segment.segmentIndex,
        sectionLabel: segment.sectionLabel,
        riskLevel: riskLevel as RiskLevel,
        highRisk,
        regenerated: true,
        editCategory: aiResponse.edit_category,
        confidenceScore: aiResponse.confidence_score,
        needsAuthorConfirmation
      }
    });

    jobEventBus.publish({
      type: 'decision_updated',
      jobId,
      timestamp: new Date().toISOString(),
      payload: {
        changeId,
        decision: DecisionType.PENDING,
        regenerated: true
      }
    });

    return updatedChange;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown regeneration error';
    await logAudit(
      'change_regeneration_failed',
      {
        changeId,
        segmentId: segment.id,
        segmentIndex: segment.segmentIndex,
        error: message
      },
      jobId,
      userId
    );
    throw error;
  }
}

export async function acceptChange(jobId: string, changeId: string, userId?: string): Promise<void> {
  await setDecision(jobId, changeId, DecisionType.ACCEPTED, userId);
  await logAudit('change_accepted', { changeId }, jobId, userId);

  jobEventBus.publish({
    type: 'decision_updated',
    jobId,
    timestamp: new Date().toISOString(),
    payload: {
      changeId,
      decision: DecisionType.ACCEPTED
    }
  });
}

export async function rejectChange(jobId: string, changeId: string, userId?: string): Promise<void> {
  await setDecision(jobId, changeId, DecisionType.REJECTED, userId);
  await logAudit('change_rejected', { changeId }, jobId, userId);

  jobEventBus.publish({
    type: 'decision_updated',
    jobId,
    timestamp: new Date().toISOString(),
    payload: {
      changeId,
      decision: DecisionType.REJECTED
    }
  });
}

export async function acceptAllChanges(jobId: string, userId?: string): Promise<void> {
  await setAllDecisions(jobId, DecisionType.ACCEPTED, userId);
  await logAudit('changes_accepted_all', {}, jobId, userId);

  jobEventBus.publish({
    type: 'decision_updated',
    jobId,
    timestamp: new Date().toISOString(),
    payload: {
      all: true,
      decision: DecisionType.ACCEPTED
    }
  });
}

export async function rejectAllChanges(jobId: string, userId?: string): Promise<void> {
  await setAllDecisions(jobId, DecisionType.REJECTED, userId);
  await logAudit('changes_rejected_all', {}, jobId, userId);

  jobEventBus.publish({
    type: 'decision_updated',
    jobId,
    timestamp: new Date().toISOString(),
    payload: {
      all: true,
      decision: DecisionType.REJECTED
    }
  });
}

export async function generateFinalFiles(jobId: string): Promise<void> {
  await generateJobArtifacts(jobId);
  await logAudit('files_generated', {}, jobId);

  const job = await getJobDetails(jobId);
  if (job) {
    await markDocumentCompleted(job.documentId);
  }
}

export async function getGeneratedDownload(jobId: string, type: GeneratedFileType) {
  const file = await getGeneratedFile(jobId, type);
  if (!file) {
    throw new Error('Generated file not found');
  }

  const data = await readStoredFile(file.storagePath);
  return {
    file,
    data
  };
}

export async function updateRules(specificationId: string, rules: string[]): Promise<void> {
  await updateSpecificationRules(specificationId, rules);
}

export async function listRecentJobs(limit = 30) {
  return listJobs(limit);
}
