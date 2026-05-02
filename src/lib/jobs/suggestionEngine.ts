import { editSegmentWithAI } from '@/lib/ai/editorClient';
import { AiEditResponse } from '@/lib/ai/schema';
import { EditingMode } from '@/lib/jobs/types';

export interface SuggestionRequest {
  specRules: string[];
  segmentText: string;
  contextBefore: string;
  contextAfter: string;
  allowMeaningChanges: boolean;
  allowProtectedEdits: boolean;
  editingMode: EditingMode;
  editorName: string;
  editorEmail: string;
  avoidEditedTexts?: string[];
  requireNonIdentical?: boolean;
  requestNote?: string;
  maxAttempts?: number;
}

export async function generateSuggestion(request: SuggestionRequest): Promise<AiEditResponse> {
  const attempts = Math.max(request.maxAttempts ?? 3, 1);
  const avoided = new Set((request.avoidEditedTexts ?? []).map(normalizeText));

  let lastDuplicateError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const baseNote = request.requestNote?.trim();
      const duplicateNote =
        attempt > 1
          ? 'The previous attempt was too similar. Keep the same meaning but use a different valid wording.'
          : '';

      const note = [baseNote, duplicateNote].filter(Boolean).join(' ').trim();

      return await editSegmentWithAI({
        specRules: request.specRules,
        segmentText: request.segmentText,
        contextBefore: request.contextBefore,
        contextAfter: request.contextAfter,
        allowMeaningChanges: request.allowMeaningChanges,
        allowProtectedEdits: request.allowProtectedEdits,
        editingMode: request.editingMode,
        editorName: request.editorName,
        editorEmail: request.editorEmail,
        mustDifferFrom: Array.from(avoided),
        forceNonIdentical: request.requireNonIdentical,
        requestNote: note.length > 0 ? note : undefined
      });
    } catch (error) {
      if (isDuplicateError(error)) {
        lastDuplicateError = error;
        continue;
      }

      throw error;
    }
  }

  if (lastDuplicateError) {
    throw new Error('Could not generate a distinct suggestion for this section after multiple attempts.');
  }

  throw new Error('Failed to generate suggestion.');
}

function isDuplicateError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes('duplicate suggestion');
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
