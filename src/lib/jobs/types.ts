export enum DocumentStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  REVIEW = 'REVIEW',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export enum SpecificationSourceType {
  TEXT = 'TEXT',
  DOCX = 'DOCX',
  PDF = 'PDF',
  TXT = 'TXT'
}

export enum EditingMode {
  GENERAL_PROFESSIONAL = 'GENERAL_PROFESSIONAL',
  SCIENTIFIC_MANUSCRIPT = 'SCIENTIFIC_MANUSCRIPT',
  TECHNICAL_RESEARCH = 'TECHNICAL_RESEARCH',
  JOURNAL_SUBMISSION = 'JOURNAL_SUBMISSION',
  GRANT_PROPOSAL = 'GRANT_PROPOSAL'
}

export enum JobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED'
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum EditCategory {
  NO_CHANGE = 'NO_CHANGE',
  GRAMMAR = 'GRAMMAR',
  SPELLING = 'SPELLING',
  CLARITY = 'CLARITY',
  SENTENCE_STRUCTURE = 'SENTENCE_STRUCTURE',
  ARTICLE_USAGE = 'ARTICLE_USAGE',
  PREPOSITION = 'PREPOSITION',
  SUBJECT_VERB_AGREEMENT = 'SUBJECT_VERB_AGREEMENT',
  PARALLELISM = 'PARALLELISM',
  PUNCTUATION = 'PUNCTUATION',
  TENSE_CONSISTENCY = 'TENSE_CONSISTENCY',
  REDUNDANCY = 'REDUNDANCY',
  SCIENTIFIC_TONE = 'SCIENTIFIC_TONE',
  TECHNICAL_READABILITY = 'TECHNICAL_READABILITY',
  CONSISTENCY = 'CONSISTENCY',
  STYLE = 'STYLE'
}

export enum DecisionType {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED'
}

export enum GeneratedFileType {
  CLEAN_DOCX = 'CLEAN_DOCX',
  COMPARISON_DOCX = 'COMPARISON_DOCX',
  CHANGELOG_PDF = 'CHANGELOG_PDF',
  HTML_PREVIEW = 'HTML_PREVIEW',
  JSON_AUDIT = 'JSON_AUDIT'
}

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface EditorProfileRecord {
  id: string;
  userId?: string;
  name: string;
  email: string;
  companyId?: string | null;
  signature?: string | null;
  dictionaryPreference: 'MERRIAM_WEBSTER';
  createdAt: string;
  updatedAt: string;
}

export interface StyleProfileRecord {
  id: string;
  userId?: string;
  name: string;
  description: string;
  rules: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GlossaryRecord {
  id: string;
  userId?: string;
  term: string;
  preferred: string;
  domain?: string | null;
  ignore: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  userId?: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;
  checksum?: string;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersionRecord {
  id: string;
  documentId: string;
  versionLabel: string;
  storagePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface EditingSpecificationRecord {
  id: string;
  userId?: string;
  documentId?: string;
  sourceType: SpecificationSourceType;
  sourcePath?: string;
  rawText: string;
  extractedText: string;
  rulesJson: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface EditingJobRecord {
  id: string;
  userId?: string;
  documentId: string;
  specificationId: string;
  status: JobStatus;
  progressPercent: number;
  currentSegmentIndex: number;
  totalSegments: number;
  currentSectionLabel?: string | null;
  model: string;
  editingMode: EditingMode;
  allowMeaningChanges: boolean;
  allowProtectedEdits: boolean;
  additionalInstructions?: string | null;
  editorProfileId?: string | null;
  editorName: string;
  editorEmail: string;
  editorCompanyId?: string | null;
  editorSignature?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSegmentRecord {
  id: string;
  jobId: string;
  segmentIndex: number;
  segmentKey: string;
  sectionLabel?: string | null;
  text: string;
  contextBefore?: string | null;
  contextAfter?: string | null;
  styleMetadata: unknown;
  isProtected: boolean;
  isEditable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiSuggestedChangeRecord {
  id: string;
  jobId: string;
  segmentId: string;
  originalText: string;
  editedText: string;
  editReason: string;
  editCategory: EditCategory;
  confidenceScore: number;
  riskLevel: RiskLevel;
  changedEntities: string[];
  needsAuthorConfirmation: boolean;
  editorComment?: string | null;
  editorName: string;
  editorEmail: string;
  editorTimestamp: string;
  revisionCycle: number;
  diffHtml: string;
  createdAt: string;
  updatedAt: string;
}

export interface EditHistoryRecord {
  id: string;
  jobId: string;
  changeId: string;
  eventType: 'SUGGESTED' | 'REGENERATED' | 'ACCEPTED' | 'REJECTED' | 'COMMENTED';
  detailsJson: Record<string, unknown>;
  createdAt: string;
}

export interface CommentRecord {
  id: string;
  jobId: string;
  changeId?: string | null;
  authorName: string;
  authorEmail: string;
  body: string;
  type: 'EDITOR_QUERY' | 'REVIEW_NOTE';
  createdAt: string;
}

export interface ChangeDecisionRecord {
  id: string;
  jobId: string;
  changeId: string;
  userId?: string;
  decision: DecisionType;
  decidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedFileRecord {
  id: string;
  jobId: string;
  fileType: GeneratedFileType;
  storagePath: string;
  mimeType: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionRecord {
  id: string;
  jobId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  id: string;
  chatSessionId: string;
  role: 'user' | 'assistant';
  message: string;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  jobId?: string;
  userId?: string;
  action: string;
  detailsJson: Record<string, unknown>;
  createdAt: string;
}

export interface RuntimeJobRecord extends EditingJobRecord {
  document: DocumentRecord;
  specification: EditingSpecificationRecord;
  segments: DocumentSegmentRecord[];
}

export interface JobDetailsRecord extends EditingJobRecord {
  generatedFiles: GeneratedFileRecord[];
}

export interface ListedChangeRecord extends AiSuggestedChangeRecord {
  segment: DocumentSegmentRecord;
  decisions: ChangeDecisionRecord[];
}
