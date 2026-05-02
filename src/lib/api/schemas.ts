import { z } from 'zod';

import { EditingMode } from '@/lib/jobs/types';

export const editingModeSchema = z.nativeEnum(EditingMode);

export const startJobSchema = z.object({
  documentId: z.string().uuid(),
  specificationId: z.string().uuid(),
  allowMeaningChanges: z.boolean().optional(),
  allowProtectedEdits: z.boolean().optional(),
  model: z.string().optional(),
  editingMode: editingModeSchema.optional(),
  additionalInstructions: z.string().max(10000).optional()
});

export const updateRuleSchema = z.object({
  rules: z.array(z.string().min(1)).min(1)
});

export const decisionSchema = z.object({
  jobId: z.string().uuid(),
  changeId: z.string().uuid()
});

export const editorProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  companyId: z.string().trim().max(120).optional().nullable(),
  signature: z.string().trim().max(300).optional().nullable()
});

export const assistantQuestionSchema = z.object({
  question: z.string().trim().min(3).max(4000)
});

export const regenerateSuggestionSchema = z.object({
  seedEditedText: z.string().trim().max(50000).optional(),
  instruction: z.string().trim().max(5000).optional()
});
