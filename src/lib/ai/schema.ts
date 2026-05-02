import { z } from 'zod';

const editCategories = [
  'NO_CHANGE',
  'GRAMMAR',
  'SPELLING',
  'CLARITY',
  'SENTENCE_STRUCTURE',
  'ARTICLE_USAGE',
  'PREPOSITION',
  'SUBJECT_VERB_AGREEMENT',
  'PARALLELISM',
  'PUNCTUATION',
  'TENSE_CONSISTENCY',
  'REDUNDANCY',
  'SCIENTIFIC_TONE',
  'TECHNICAL_READABILITY',
  'CONSISTENCY',
  'STYLE'
] as const;

export const aiEditSchema = z.object({
  original_text: z.string(),
  edited_text: z.string(),
  edit_reason: z.string().min(1),
  edit_category: z.enum(editCategories).default('STYLE'),
  confidence_score: z.number().min(0).max(1).default(0.82),
  risk_level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  changed_entities: z.array(z.string()).default([]),
  needs_author_confirmation: z.boolean().default(false),
  editor_query: z.string().trim().min(1).nullable().optional()
});

export type AiEditResponse = z.infer<typeof aiEditSchema>;
