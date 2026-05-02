import { DecisionType, EditCategory, JobStatus, RiskLevel } from '@/lib/jobs/types';

import { logger } from '@/lib/logger';
import { buildInlineDiffHtml, containsHighRiskEntity, inferHighRiskFromTextDelta } from '@/lib/review/diff';
import { jobEventBus } from '@/lib/jobs/eventBus';
import { generateJobArtifacts } from '@/lib/jobs/exporter';
import { logAudit } from '@/lib/jobs/audit';
import {
  createComment,
  getJobForRuntime,
  markDocumentForReview,
  setAllDecisions,
  setJobStatus,
  upsertSuggestedChange
} from '@/lib/jobs/repository';
import { generateSuggestion } from '@/lib/jobs/suggestionEngine';

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

export async function runEditingJob(jobId: string): Promise<void> {
  const runtime = await getJobForRuntime(jobId);
  if (!runtime) {
    return;
  }

  if (runtime.status === JobStatus.CANCELED || runtime.status === JobStatus.COMPLETED) {
    return;
  }

  await setJobStatus(jobId, JobStatus.RUNNING, {
    startedAt: runtime.startedAt ?? new Date(),
    errorMessage: null
  });

  await logAudit(
    'job_started',
    {
      totalSegments: runtime.totalSegments,
      allowMeaningChanges: runtime.allowMeaningChanges,
      allowProtectedEdits: runtime.allowProtectedEdits,
      editingMode: runtime.editingMode,
      editorName: runtime.editorName,
      editorEmail: runtime.editorEmail
    },
    jobId
  );

  jobEventBus.publish({
    type: 'job_started',
    jobId,
    timestamp: new Date().toISOString(),
    payload: {
      totalSegments: runtime.totalSegments,
      editingMode: runtime.editingMode,
      editorName: runtime.editorName,
      editorEmail: runtime.editorEmail
    }
  });

  const rules = parseSpecRules(runtime.specification.rulesJson);

  for (let index = runtime.currentSegmentIndex; index < runtime.segments.length; index += 1) {
    const latestJob = await getJobForRuntime(jobId);
    if (!latestJob) {
      return;
    }

    if (latestJob.status === JobStatus.PAUSED) {
      jobEventBus.publish({
        type: 'job_paused',
        jobId,
        timestamp: new Date().toISOString(),
        payload: { atSegment: index }
      });
      return;
    }

    if (latestJob.status === JobStatus.CANCELED) {
      jobEventBus.publish({
        type: 'job_canceled',
        jobId,
        timestamp: new Date().toISOString(),
        payload: { atSegment: index }
      });
      return;
    }

    const segment = runtime.segments[index];
    if (!segment) {
      continue;
    }

    const progress = Number((((index + 1) / runtime.segments.length) * 100).toFixed(2));

    if (!segment.isEditable || (segment.isProtected && !runtime.allowProtectedEdits)) {
      await setJobStatus(jobId, JobStatus.RUNNING, {
        currentSegmentIndex: index + 1,
        progressPercent: progress,
        currentSectionLabel: segment.sectionLabel
      });

      await logAudit(
        'segment_skipped',
        {
          segmentId: segment.id,
          segmentIndex: segment.segmentIndex,
          sectionLabel: segment.sectionLabel,
          isEditable: segment.isEditable,
          isProtected: segment.isProtected
        },
        jobId
      );

      continue;
    }

    try {
      const aiResponse = await retryEdit(async () =>
        generateSuggestion({
          specRules: rules,
          segmentText: segment.text,
          contextBefore: segment.contextBefore ?? '',
          contextAfter: segment.contextAfter ?? '',
          allowMeaningChanges: runtime.allowMeaningChanges,
          allowProtectedEdits: runtime.allowProtectedEdits,
          editingMode: runtime.editingMode,
          editorName: runtime.editorName,
          editorEmail: runtime.editorEmail,
          requestNote: buildSegmentRequestNote(runtime.additionalInstructions),
          maxAttempts: 3
        })
      );

      const changedEntities = aiResponse.changed_entities ?? [];
      const highRisk =
        containsHighRiskEntity(changedEntities) ||
        inferHighRiskFromTextDelta(aiResponse.original_text, aiResponse.edited_text);
      const riskLevel = highRisk && aiResponse.risk_level === 'LOW' ? 'HIGH' : aiResponse.risk_level;
      const needsAuthorConfirmation =
        Boolean(aiResponse.needs_author_confirmation) ||
        (aiResponse.editor_query ?? '').trim().length > 0;

      const change = await upsertSuggestedChange({
        jobId,
        segmentId: segment.id,
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
        revisionCycle: 1,
        diffHtml: buildInlineDiffHtml(aiResponse.original_text, aiResponse.edited_text)
      });

      if (needsAuthorConfirmation && (aiResponse.editor_query ?? '').trim().length > 0) {
        await createComment({
          jobId,
          changeId: change.id,
          authorName: runtime.editorName,
          authorEmail: runtime.editorEmail,
          body: aiResponse.editor_query ?? '',
          type: 'EDITOR_QUERY'
        });
      }

      await setJobStatus(jobId, JobStatus.RUNNING, {
        currentSegmentIndex: index + 1,
        progressPercent: progress,
        currentSectionLabel: segment.sectionLabel
      });

      await logAudit(
        'change_suggested',
        {
          segmentId: segment.id,
          changeId: change.id,
          segmentIndex: segment.segmentIndex,
          sectionLabel: segment.sectionLabel,
          riskLevel,
          highRisk,
          editCategory: aiResponse.edit_category,
          confidenceScore: aiResponse.confidence_score,
          needsAuthorConfirmation,
          hasEditorQuery: Boolean((aiResponse.editor_query ?? '').trim())
        },
        jobId
      );

      jobEventBus.publish({
        type: 'change_suggested',
        jobId,
        timestamp: new Date().toISOString(),
        payload: {
          segmentIndex: segment.segmentIndex,
          sectionLabel: segment.sectionLabel,
          changeId: change.id,
          highRisk,
          riskLevel,
          editCategory: aiResponse.edit_category,
          confidenceScore: aiResponse.confidence_score,
          needsAuthorConfirmation
        }
      });

      jobEventBus.publish({
        type: 'job_progress',
        jobId,
        timestamp: new Date().toISOString(),
        payload: {
          progress,
          currentSegmentIndex: index + 1,
          totalSegments: runtime.segments.length,
          currentSectionLabel: segment.sectionLabel
        }
      });
    } catch (error) {
      const details = serializeError(error);
      const message = String(details.message ?? 'Unknown editing error');

      await setJobStatus(jobId, JobStatus.FAILED, {
        errorMessage: message,
        finishedAt: new Date()
      });

      await logAudit(
        'job_failed',
        {
          error: message,
          segmentIndex: index,
          sectionLabel: segment.sectionLabel,
          errorDetails: details
        },
        jobId
      );

      jobEventBus.publish({
        type: 'job_failed',
        jobId,
        timestamp: new Date().toISOString(),
        payload: {
          error: message,
          segmentIndex: index,
          sectionLabel: segment.sectionLabel,
          errorDetails: details
        }
      });

      logger.error({ jobId, error }, 'Job failed during editing');
      return;
    }
  }

  await setJobStatus(jobId, JobStatus.COMPLETED, {
    progressPercent: 100,
    finishedAt: new Date(),
    currentSegmentIndex: runtime.segments.length
  });

  await setAllDecisions(jobId, DecisionType.PENDING);
  await markDocumentForReview(runtime.documentId);

  try {
    await generateJobArtifacts(jobId);

    await logAudit('files_generated', {}, jobId);

    jobEventBus.publish({
      type: 'files_generated',
      jobId,
      timestamp: new Date().toISOString(),
      payload: {}
    });
  } catch (error) {
    const details = serializeError(error);
    await logAudit('files_generation_failed', { error: details.message, errorDetails: details }, jobId);
    logger.warn({ jobId, error }, 'Artifact generation failed after completed job');
  }

  await logAudit('job_completed', { totalSegments: runtime.segments.length }, jobId);

  jobEventBus.publish({
    type: 'job_completed',
    jobId,
    timestamp: new Date().toISOString(),
    payload: {
      totalSegments: runtime.segments.length
    }
  });
}

function buildSegmentRequestNote(additionalInstructions?: string | null): string {
  const base = 'Apply conservative improvements when appropriate and preserve technical/legal intent.';
  const trimmed = additionalInstructions?.trim();
  if (!trimmed) {
    return base;
  }

  return `${base}\nAdditional user instructions:\n${trimmed}`;
}

async function retryEdit<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetriableError(error) || attempt === maxAttempts) {
        throw error;
      }
      await sleep(350 * attempt);
    }
  }

  throw lastError;
}

function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  return !error.message.includes('OPENAI_API_KEY');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const extra = error as Error & {
      status?: number;
      code?: string;
      type?: string;
      cause?: unknown;
    };

    return {
      name: extra.name,
      message: extra.message,
      stack: extra.stack,
      status: extra.status,
      code: extra.code,
      type: extra.type,
      cause: extra.cause
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown error'
  };
}
