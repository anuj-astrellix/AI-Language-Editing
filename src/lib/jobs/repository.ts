import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

import { EditableSegment } from '@/lib/docx/types';
import {
  AiSuggestedChangeRecord,
  AuditLogRecord,
  ChangeDecisionRecord,
  ChatMessageRecord,
  ChatSessionRecord,
  CommentRecord,
  DecisionType,
  DocumentRecord,
  DocumentSegmentRecord,
  DocumentStatus,
  DocumentVersionRecord,
  EditCategory,
  EditHistoryRecord,
  EditingJobRecord,
  EditingMode,
  EditingSpecificationRecord,
  EditorProfileRecord,
  GeneratedFileRecord,
  GeneratedFileType,
  GlossaryRecord,
  JobDetailsRecord,
  JobStatus,
  ListedChangeRecord,
  RiskLevel,
  RuntimeJobRecord,
  SpecificationSourceType,
  StyleProfileRecord,
  UserRecord
} from '@/lib/jobs/types';

interface FsStore {
  users: UserRecord[];
  editorProfiles: EditorProfileRecord[];
  styleProfiles: StyleProfileRecord[];
  glossaries: GlossaryRecord[];
  documents: DocumentRecord[];
  documentVersions: DocumentVersionRecord[];
  specifications: EditingSpecificationRecord[];
  jobs: EditingJobRecord[];
  segments: DocumentSegmentRecord[];
  changes: AiSuggestedChangeRecord[];
  editHistory: EditHistoryRecord[];
  comments: CommentRecord[];
  decisions: ChangeDecisionRecord[];
  generatedFiles: GeneratedFileRecord[];
  chatSessions: ChatSessionRecord[];
  chatMessages: ChatMessageRecord[];
  auditLogs: AuditLogRecord[];
}

const STORE_PATH = join(process.cwd(), 'storage/fs-db.json');

const DEFAULT_EDITOR_NAME = 'Meenakshi Sharma';
const DEFAULT_EDITOR_EMAIL = 'barthwal.meenakshi@gmail.com';

const EMPTY_STORE: FsStore = {
  users: [],
  editorProfiles: [],
  styleProfiles: [],
  glossaries: [],
  documents: [],
  documentVersions: [],
  specifications: [],
  jobs: [],
  segments: [],
  changes: [],
  editHistory: [],
  comments: [],
  decisions: [],
  generatedFiles: [],
  chatSessions: [],
  chatMessages: [],
  auditLogs: []
};

let writeChain: Promise<void> = Promise.resolve();

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampConfidence(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0.82;
  }

  return Math.max(0, Math.min(1, Number(value)));
}

function normalizeEditCategory(value: unknown): EditCategory {
  if (typeof value !== 'string') {
    return EditCategory.STYLE;
  }

  const normalized = value.toUpperCase() as EditCategory;
  if (Object.values(EditCategory).includes(normalized)) {
    return normalized;
  }

  return EditCategory.STYLE;
}

function normalizeEditingMode(value: unknown): EditingMode {
  if (typeof value !== 'string') {
    return EditingMode.SCIENTIFIC_MANUSCRIPT;
  }

  const normalized = value.toUpperCase() as EditingMode;
  if (Object.values(EditingMode).includes(normalized)) {
    return normalized;
  }

  return EditingMode.SCIENTIFIC_MANUSCRIPT;
}

async function ensureStoreFile(): Promise<void> {
  await fs.mkdir(dirname(STORE_PATH), { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify(EMPTY_STORE, null, 2), 'utf-8');
  }
}

async function readStoreUnsafe(): Promise<FsStore> {
  await ensureStoreFile();
  const raw = await fs.readFile(STORE_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<FsStore>;

  return {
    users: parsed.users ?? [],
    editorProfiles: parsed.editorProfiles ?? [],
    styleProfiles: parsed.styleProfiles ?? [],
    glossaries: parsed.glossaries ?? [],
    documents: parsed.documents ?? [],
    documentVersions: parsed.documentVersions ?? [],
    specifications: parsed.specifications ?? [],
    jobs: parsed.jobs ?? [],
    segments: parsed.segments ?? [],
    changes: parsed.changes ?? [],
    editHistory: parsed.editHistory ?? [],
    comments: parsed.comments ?? [],
    decisions: parsed.decisions ?? [],
    generatedFiles: parsed.generatedFiles ?? [],
    chatSessions: parsed.chatSessions ?? [],
    chatMessages: parsed.chatMessages ?? [],
    auditLogs: parsed.auditLogs ?? []
  };
}

async function readStore(): Promise<FsStore> {
  await writeChain;
  return readStoreUnsafe();
}

async function writeStoreUnsafe(store: FsStore): Promise<void> {
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

async function mutateStore<T>(mutator: (store: FsStore) => T | Promise<T>): Promise<T> {
  let result!: T;
  writeChain = writeChain.then(async () => {
    const store = await readStoreUnsafe();
    result = await mutator(store);
    await writeStoreUnsafe(store);
  });

  await writeChain;
  return result;
}

function normalizeJobPatch(extra: Record<string, unknown>): Partial<EditingJobRecord> {
  const output: Partial<EditingJobRecord> = {};
  for (const [key, value] of Object.entries(extra)) {
    if (value instanceof Date) {
      (output as Record<string, unknown>)[key] = value.toISOString();
    } else {
      (output as Record<string, unknown>)[key] = value;
    }
  }
  return output;
}

function buildDefaultEditorProfile(userId?: string): EditorProfileRecord {
  const now = nowIso();
  return {
    id: randomUUID(),
    userId,
    name: DEFAULT_EDITOR_NAME,
    email: DEFAULT_EDITOR_EMAIL,
    companyId: null,
    signature: 'Meenakshi Sharma',
    dictionaryPreference: 'MERRIAM_WEBSTER',
    createdAt: now,
    updatedAt: now
  };
}

function hydrateChangeRecord(change: AiSuggestedChangeRecord, job?: EditingJobRecord): AiSuggestedChangeRecord {
  return {
    ...change,
    editCategory: normalizeEditCategory(change.editCategory),
    confidenceScore: clampConfidence(change.confidenceScore),
    needsAuthorConfirmation: Boolean(change.needsAuthorConfirmation),
    editorComment: normalizeNullableString(change.editorComment),
    editorName: normalizeNullableString(change.editorName) ?? job?.editorName ?? DEFAULT_EDITOR_NAME,
    editorEmail: normalizeNullableString(change.editorEmail) ?? job?.editorEmail ?? DEFAULT_EDITOR_EMAIL,
    editorTimestamp: normalizeNullableString(change.editorTimestamp) ?? change.updatedAt ?? change.createdAt,
    revisionCycle: Math.max(1, Number(change.revisionCycle ?? 1))
  };
}

export async function getActiveEditorProfile(userId?: string): Promise<EditorProfileRecord> {
  const store = await readStore();

  const scopedProfiles =
    userId && userId.trim().length > 0
      ? store.editorProfiles.filter((profile) => profile.userId === userId)
      : store.editorProfiles;

  const latest = scopedProfiles.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (latest) {
    return latest;
  }

  return mutateStore((mutableStore) => {
    const profile = buildDefaultEditorProfile(userId);
    mutableStore.editorProfiles.push(profile);
    return profile;
  });
}

export async function saveEditorProfile(input: {
  name: string;
  email: string;
  companyId?: string | null;
  signature?: string | null;
  userId?: string;
}) {
  const normalizedName = input.name.trim();
  const normalizedEmail = input.email.trim();

  if (!normalizedName) {
    throw new Error('Editor name is required');
  }

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Valid editor email is required');
  }

  return mutateStore((store) => {
    const now = nowIso();

    const scoped =
      input.userId && input.userId.trim().length > 0
        ? store.editorProfiles.filter((profile) => profile.userId === input.userId)
        : store.editorProfiles;

    const latest = scoped.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    if (latest) {
      latest.name = normalizedName;
      latest.email = normalizedEmail;
      latest.companyId = normalizeNullableString(input.companyId);
      latest.signature = normalizeNullableString(input.signature);
      latest.updatedAt = now;
      return latest;
    }

    const created: EditorProfileRecord = {
      ...buildDefaultEditorProfile(input.userId),
      id: randomUUID(),
      name: normalizedName,
      email: normalizedEmail,
      companyId: normalizeNullableString(input.companyId),
      signature: normalizeNullableString(input.signature),
      createdAt: now,
      updatedAt: now
    };

    store.editorProfiles.push(created);
    return created;
  });
}

export async function createDocument(input: {
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;
  checksum?: string;
  userId?: string;
}) {
  return mutateStore((store) => {
    const now = nowIso();
    const record: DocumentRecord = {
      id: randomUUID(),
      userId: input.userId,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      storagePath: input.storagePath,
      checksum: input.checksum,
      status: DocumentStatus.UPLOADED,
      createdAt: now,
      updatedAt: now
    };

    store.documents.push(record);
    return record;
  });
}

export async function getDocument(documentId: string) {
  const store = await readStore();
  return store.documents.find((doc) => doc.id === documentId) ?? null;
}

export async function getMostRecentJobForDocument(documentId: string) {
  const store = await readStore();
  const jobs = store.jobs
    .filter((job) => job.documentId === documentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return jobs[0] ?? null;
}

export async function createSpecification(input: {
  sourceType: 'TEXT' | 'DOCX' | 'PDF' | 'TXT';
  rawText: string;
  extractedText: string;
  rulesJson: unknown;
  sourcePath?: string;
  documentId?: string;
  userId?: string;
}) {
  return mutateStore((store) => {
    const now = nowIso();
    const record: EditingSpecificationRecord = {
      id: randomUUID(),
      userId: input.userId,
      documentId: input.documentId,
      sourceType: input.sourceType as SpecificationSourceType,
      sourcePath: input.sourcePath,
      rawText: input.rawText,
      extractedText: input.extractedText,
      rulesJson: input.rulesJson,
      createdAt: now,
      updatedAt: now
    };

    store.specifications.push(record);
    return record;
  });
}

export async function updateSpecificationRules(specificationId: string, rules: string[]) {
  return mutateStore((store) => {
    const specification = store.specifications.find((item) => item.id === specificationId);
    if (!specification) {
      throw new Error('Specification not found');
    }

    specification.rulesJson = rules;
    specification.updatedAt = nowIso();
    return specification;
  });
}

export async function getSpecification(specificationId: string) {
  const store = await readStore();
  return store.specifications.find((item) => item.id === specificationId) ?? null;
}

export async function createEditingJob(input: {
  documentId: string;
  specificationId: string;
  model: string;
  editingMode: EditingMode;
  allowMeaningChanges: boolean;
  allowProtectedEdits: boolean;
  additionalInstructions?: string;
  editorProfileId?: string | null;
  editorName: string;
  editorEmail: string;
  editorCompanyId?: string | null;
  editorSignature?: string | null;
  segments: EditableSegment[];
  userId?: string;
}) {
  return mutateStore((store) => {
    const now = nowIso();

    const job: EditingJobRecord = {
      id: randomUUID(),
      userId: input.userId,
      documentId: input.documentId,
      specificationId: input.specificationId,
      status: JobStatus.PENDING,
      progressPercent: 0,
      currentSegmentIndex: 0,
      totalSegments: input.segments.length,
      currentSectionLabel: null,
      model: input.model,
      editingMode: normalizeEditingMode(input.editingMode),
      allowMeaningChanges: input.allowMeaningChanges,
      allowProtectedEdits: input.allowProtectedEdits,
      additionalInstructions: input.additionalInstructions?.trim() || null,
      editorProfileId: normalizeNullableString(input.editorProfileId),
      editorName: input.editorName.trim() || DEFAULT_EDITOR_NAME,
      editorEmail: input.editorEmail.trim() || DEFAULT_EDITOR_EMAIL,
      editorCompanyId: normalizeNullableString(input.editorCompanyId),
      editorSignature: normalizeNullableString(input.editorSignature),
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now
    };

    const segments: DocumentSegmentRecord[] = input.segments.map((segment) => ({
      id: randomUUID(),
      jobId: job.id,
      segmentIndex: segment.segmentIndex,
      segmentKey: segment.segmentKey,
      sectionLabel: segment.sectionLabel,
      text: segment.text,
      contextBefore: segment.contextBefore,
      contextAfter: segment.contextAfter,
      styleMetadata: segment.styleMetadata,
      isProtected: segment.isProtected,
      isEditable: segment.isEditable,
      createdAt: now,
      updatedAt: now
    }));

    const document = store.documents.find((doc) => doc.id === input.documentId);
    if (document) {
      document.status = DocumentStatus.PROCESSING;
      document.updatedAt = now;
    }

    store.jobs.push(job);
    store.segments.push(...segments);
    return job;
  });
}

export async function getJobForRuntime(jobId: string): Promise<RuntimeJobRecord | null> {
  const store = await readStore();
  const job = store.jobs.find((item) => item.id === jobId);
  if (!job) {
    return null;
  }

  const document = store.documents.find((item) => item.id === job.documentId);
  const specification = store.specifications.find((item) => item.id === job.specificationId);
  if (!document || !specification) {
    return null;
  }

  const segments = store.segments.filter((item) => item.jobId === job.id).sort((a, b) => a.segmentIndex - b.segmentIndex);

  return {
    ...job,
    editingMode: normalizeEditingMode(job.editingMode),
    document,
    specification,
    segments
  };
}

export async function getJobDetails(jobId: string): Promise<JobDetailsRecord | null> {
  const store = await readStore();
  const job = store.jobs.find((item) => item.id === jobId);
  if (!job) {
    return null;
  }

  return {
    ...job,
    editingMode: normalizeEditingMode(job.editingMode),
    generatedFiles: store.generatedFiles.filter((item) => item.jobId === job.id)
  };
}

export async function setJobStatus(jobId: string, status: JobStatus, extra: Record<string, unknown> = {}) {
  return mutateStore((store) => {
    const job = store.jobs.find((item) => item.id === jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    Object.assign(job, normalizeJobPatch(extra), {
      status,
      updatedAt: nowIso()
    });

    return job;
  });
}

export async function upsertSuggestedChange(input: {
  jobId: string;
  segmentId: string;
  originalText: string;
  editedText: string;
  editReason: string;
  editCategory?: EditCategory;
  confidenceScore?: number;
  riskLevel: RiskLevel;
  changedEntities: string[];
  needsAuthorConfirmation?: boolean;
  editorComment?: string | null;
  editorName?: string;
  editorEmail?: string;
  editorTimestamp?: string;
  revisionCycle?: number;
  diffHtml: string;
}) {
  return mutateStore((store) => {
    const now = nowIso();

    const change: AiSuggestedChangeRecord = {
      id: randomUUID(),
      jobId: input.jobId,
      segmentId: input.segmentId,
      originalText: input.originalText,
      editedText: input.editedText,
      editReason: input.editReason,
      editCategory: normalizeEditCategory(input.editCategory),
      confidenceScore: clampConfidence(input.confidenceScore),
      riskLevel: input.riskLevel,
      changedEntities: input.changedEntities,
      needsAuthorConfirmation: Boolean(input.needsAuthorConfirmation),
      editorComment: normalizeNullableString(input.editorComment),
      editorName: normalizeNullableString(input.editorName) ?? DEFAULT_EDITOR_NAME,
      editorEmail: normalizeNullableString(input.editorEmail) ?? DEFAULT_EDITOR_EMAIL,
      editorTimestamp: normalizeNullableString(input.editorTimestamp) ?? now,
      revisionCycle: Math.max(1, Number(input.revisionCycle ?? 1)),
      diffHtml: input.diffHtml,
      createdAt: now,
      updatedAt: now
    };

    const decision: ChangeDecisionRecord = {
      id: randomUUID(),
      jobId: input.jobId,
      changeId: change.id,
      decision: DecisionType.PENDING,
      createdAt: now,
      updatedAt: now,
      decidedAt: null
    };

    store.changes.push(change);
    store.decisions.push(decision);

    store.editHistory.push({
      id: randomUUID(),
      jobId: input.jobId,
      changeId: change.id,
      eventType: 'SUGGESTED',
      detailsJson: {
        riskLevel: input.riskLevel,
        editCategory: normalizeEditCategory(input.editCategory),
        confidenceScore: clampConfidence(input.confidenceScore)
      },
      createdAt: now
    });

    return change;
  });
}

export async function getChangeForJob(jobId: string, changeId: string): Promise<ListedChangeRecord | null> {
  const store = await readStore();
  const change = store.changes.find((item) => item.jobId === jobId && item.id === changeId);
  if (!change) {
    return null;
  }

  const segment = store.segments.find((item) => item.id === change.segmentId);
  if (!segment) {
    return null;
  }

  const job = store.jobs.find((item) => item.id === jobId);

  return {
    ...hydrateChangeRecord(change, job),
    segment,
    decisions: store.decisions
      .filter((decision) => decision.jobId === jobId && decision.changeId === change.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  };
}

export async function replaceSuggestedChange(input: {
  jobId: string;
  changeId: string;
  originalText: string;
  editedText: string;
  editReason: string;
  editCategory?: EditCategory;
  confidenceScore?: number;
  riskLevel: RiskLevel;
  changedEntities: string[];
  needsAuthorConfirmation?: boolean;
  editorComment?: string | null;
  editorName?: string;
  editorEmail?: string;
  editorTimestamp?: string;
  diffHtml: string;
}) {
  return mutateStore((store) => {
    const now = nowIso();

    const change = store.changes.find((item) => item.jobId === input.jobId && item.id === input.changeId);
    if (!change) {
      throw new Error('Suggested change not found');
    }

    const previousCycle = Math.max(1, Number(change.revisionCycle ?? 1));

    change.originalText = input.originalText;
    change.editedText = input.editedText;
    change.editReason = input.editReason;
    change.editCategory = normalizeEditCategory(input.editCategory ?? change.editCategory);
    change.confidenceScore = clampConfidence(input.confidenceScore ?? change.confidenceScore);
    change.riskLevel = input.riskLevel;
    change.changedEntities = input.changedEntities;
    change.needsAuthorConfirmation = Boolean(input.needsAuthorConfirmation);
    change.editorComment = normalizeNullableString(input.editorComment);
    change.editorName = normalizeNullableString(input.editorName) ?? change.editorName ?? DEFAULT_EDITOR_NAME;
    change.editorEmail = normalizeNullableString(input.editorEmail) ?? change.editorEmail ?? DEFAULT_EDITOR_EMAIL;
    change.editorTimestamp = normalizeNullableString(input.editorTimestamp) ?? now;
    change.revisionCycle = previousCycle + 1;
    change.diffHtml = input.diffHtml;
    change.updatedAt = now;

    const existingDecision = store.decisions.find((item) => item.jobId === input.jobId && item.changeId === input.changeId);
    if (existingDecision) {
      existingDecision.decision = DecisionType.PENDING;
      existingDecision.decidedAt = null;
      existingDecision.updatedAt = now;
    } else {
      store.decisions.push({
        id: randomUUID(),
        jobId: input.jobId,
        changeId: input.changeId,
        decision: DecisionType.PENDING,
        createdAt: now,
        updatedAt: now,
        decidedAt: null
      });
    }

    store.editHistory.push({
      id: randomUUID(),
      jobId: input.jobId,
      changeId: input.changeId,
      eventType: 'REGENERATED',
      detailsJson: {
        revisionCycle: change.revisionCycle,
        riskLevel: input.riskLevel,
        editCategory: change.editCategory,
        confidenceScore: change.confidenceScore
      },
      createdAt: now
    });

    return change;
  });
}

export async function listChanges(jobId: string): Promise<ListedChangeRecord[]> {
  const store = await readStore();
  const job = store.jobs.find((item) => item.id === jobId);

  const mapped = store.changes
    .filter((change) => change.jobId === jobId)
    .map((change) => {
      const segment = store.segments.find((item) => item.id === change.segmentId);
      if (!segment) {
        return null;
      }

      return {
        ...hydrateChangeRecord(change, job),
        segment,
        decisions: store.decisions
          .filter((decision) => decision.jobId === jobId && decision.changeId === change.id)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      };
    })
    .filter((item): item is ListedChangeRecord => Boolean(item));

  return mapped.sort((a, b) => {
    if (a.segment.segmentIndex === b.segment.segmentIndex) {
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    return a.segment.segmentIndex - b.segment.segmentIndex;
  });
}

export async function listSegments(jobId: string) {
  const store = await readStore();
  return store.segments.filter((segment) => segment.jobId === jobId).sort((a, b) => a.segmentIndex - b.segmentIndex);
}

export async function setDecision(jobId: string, changeId: string, decision: DecisionType, userId?: string) {
  return mutateStore((store) => {
    const now = nowIso();
    const existing = store.decisions.find((item) => item.jobId === jobId && item.changeId === changeId);

    if (existing) {
      existing.decision = decision;
      existing.userId = userId;
      existing.decidedAt = decision === DecisionType.PENDING ? null : now;
      existing.updatedAt = now;
    } else {
      store.decisions.push({
        id: randomUUID(),
        jobId,
        changeId,
        decision,
        userId,
        decidedAt: decision === DecisionType.PENDING ? null : now,
        createdAt: now,
        updatedAt: now
      });
    }

    store.editHistory.push({
      id: randomUUID(),
      jobId,
      changeId,
      eventType: decision === DecisionType.ACCEPTED ? 'ACCEPTED' : decision === DecisionType.REJECTED ? 'REJECTED' : 'COMMENTED',
      detailsJson: {
        decision,
        userId: userId ?? null
      },
      createdAt: now
    });

    return existing;
  });
}

export async function setAllDecisions(jobId: string, decision: DecisionType, userId?: string) {
  return mutateStore((store) => {
    const now = nowIso();
    const changes = store.changes.filter((change) => change.jobId === jobId);

    for (const change of changes) {
      const existing = store.decisions.find((item) => item.jobId === jobId && item.changeId === change.id);
      if (existing) {
        existing.decision = decision;
        existing.userId = userId;
        existing.decidedAt = decision === DecisionType.PENDING ? null : now;
        existing.updatedAt = now;
      } else {
        store.decisions.push({
          id: randomUUID(),
          jobId,
          changeId: change.id,
          decision,
          userId,
          decidedAt: decision === DecisionType.PENDING ? null : now,
          createdAt: now,
          updatedAt: now
        });
      }

      store.editHistory.push({
        id: randomUUID(),
        jobId,
        changeId: change.id,
        eventType: decision === DecisionType.ACCEPTED ? 'ACCEPTED' : 'REJECTED',
        detailsJson: {
          decision,
          userId: userId ?? null,
          bulk: true
        },
        createdAt: now
      });
    }
  });
}

export async function saveGeneratedFile(input: {
  jobId: string;
  fileType: GeneratedFileType;
  storagePath: string;
  mimeType: string;
  metadata: unknown;
}) {
  return mutateStore((store) => {
    const now = nowIso();
    const existing = store.generatedFiles.find((item) => item.jobId === input.jobId && item.fileType === input.fileType);

    if (existing) {
      existing.storagePath = input.storagePath;
      existing.mimeType = input.mimeType;
      existing.metadata = input.metadata;
      existing.updatedAt = now;
      return existing;
    }

    const created: GeneratedFileRecord = {
      id: randomUUID(),
      jobId: input.jobId,
      fileType: input.fileType,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now
    };

    store.generatedFiles.push(created);
    return created;
  });
}

export async function getGeneratedFile(jobId: string, fileType: GeneratedFileType) {
  const store = await readStore();
  return store.generatedFiles.find((item) => item.jobId === jobId && item.fileType === fileType) ?? null;
}

export async function markDocumentForReview(documentId: string) {
  return mutateStore((store) => {
    const document = store.documents.find((item) => item.id === documentId);
    if (!document) {
      return null;
    }

    document.status = DocumentStatus.REVIEW;
    document.updatedAt = nowIso();
    return document;
  });
}

export async function markDocumentCompleted(documentId: string) {
  return mutateStore((store) => {
    const document = store.documents.find((item) => item.id === documentId);
    if (!document) {
      return null;
    }

    document.status = DocumentStatus.COMPLETED;
    document.updatedAt = nowIso();
    return document;
  });
}

export async function listJobs(limit = 30) {
  const store = await readStore();

  return store.jobs
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((job) => {
      const document = store.documents.find((item) => item.id === job.documentId);
      const specification = store.specifications.find((item) => item.id === job.specificationId);

      return {
        ...job,
        editingMode: normalizeEditingMode(job.editingMode),
        document: {
          originalFilename: document?.originalFilename ?? 'Unknown document'
        },
        specification: {
          sourceType: specification?.sourceType ?? SpecificationSourceType.TEXT
        }
      };
    });
}

export async function listAuditLogs(jobId: string, limit = 250) {
  const store = await readStore();

  return store.auditLogs
    .filter((log) => log.jobId === jobId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function appendAuditLog(input: {
  action: string;
  detailsJson: Record<string, unknown>;
  jobId?: string;
  userId?: string;
}) {
  return mutateStore((store) => {
    const log: AuditLogRecord = {
      id: randomUUID(),
      jobId: input.jobId,
      userId: input.userId,
      action: input.action,
      detailsJson: input.detailsJson,
      createdAt: nowIso()
    };

    store.auditLogs.push(log);
    return log;
  });
}

export async function getOrCreateChatSession(jobId: string, title = 'Document-Aware Editing Chat') {
  return mutateStore((store) => {
    const existing = store.chatSessions
      .filter((session) => session.jobId === jobId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    if (existing) {
      return existing;
    }

    const now = nowIso();
    const created: ChatSessionRecord = {
      id: randomUUID(),
      jobId,
      title,
      createdAt: now,
      updatedAt: now
    };

    store.chatSessions.push(created);
    return created;
  });
}

export async function appendChatMessage(input: {
  chatSessionId: string;
  role: 'user' | 'assistant';
  message: string;
}) {
  return mutateStore((store) => {
    const session = store.chatSessions.find((item) => item.id === input.chatSessionId);
    if (!session) {
      throw new Error('Chat session not found');
    }

    const now = nowIso();
    const created: ChatMessageRecord = {
      id: randomUUID(),
      chatSessionId: input.chatSessionId,
      role: input.role,
      message: input.message,
      createdAt: now
    };

    session.updatedAt = now;
    store.chatMessages.push(created);
    return created;
  });
}

export async function listChatMessages(chatSessionId: string, limit = 100) {
  const store = await readStore();
  return store.chatMessages
    .filter((message) => message.chatSessionId === chatSessionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-Math.max(1, limit));
}

export async function createComment(input: {
  jobId: string;
  changeId?: string | null;
  authorName: string;
  authorEmail: string;
  body: string;
  type: 'EDITOR_QUERY' | 'REVIEW_NOTE';
}) {
  return mutateStore((store) => {
    const created: CommentRecord = {
      id: randomUUID(),
      jobId: input.jobId,
      changeId: normalizeNullableString(input.changeId),
      authorName: input.authorName,
      authorEmail: input.authorEmail,
      body: input.body,
      type: input.type,
      createdAt: nowIso()
    };

    store.comments.push(created);
    return created;
  });
}

export async function listComments(jobId: string, changeId?: string) {
  const store = await readStore();
  return store.comments
    .filter((comment) => comment.jobId === jobId)
    .filter((comment) => (changeId ? comment.changeId === changeId : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
