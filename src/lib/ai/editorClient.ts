import OpenAI from 'openai';

import { env } from '@/lib/config';
import { AiEditResponse, aiEditSchema } from '@/lib/ai/schema';
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/ai/prompt';
import { EditingMode } from '@/lib/jobs/types';
import { getConfiguredOpenAiApiKey } from '@/lib/server/runtimeSecrets';

export interface EditChunkInput {
  specRules: string[];
  segmentText: string;
  contextBefore: string;
  contextAfter: string;
  allowMeaningChanges: boolean;
  allowProtectedEdits: boolean;
  mustDifferFrom?: string[];
  forceNonIdentical?: boolean;
  requestNote?: string;
  editingMode: EditingMode;
  editorName: string;
  editorEmail: string;
}

export interface AssistantChatInput {
  question: string;
  editingMode: EditingMode;
  editorName: string;
  editorEmail: string;
  specRules: string[];
  documentExcerpt: string;
  recentChanges: Array<{
    section: string;
    originalText: string;
    editedText: string;
    reason: string;
    category: string;
    confidence: number;
  }>;
}

export async function editSegmentWithAI(input: EditChunkInput): Promise<AiEditResponse> {
  const apiKey = await getConfiguredOpenAiApiKey();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Add it in .env before starting an AI editing job.');
  }

  const client = new OpenAI({ apiKey });

  const response = await client.responses.create({
    model: env.AI_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: SYSTEM_PROMPT }]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: buildUserPrompt(input)
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'editor_response',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            original_text: { type: 'string' },
            edited_text: { type: 'string' },
            edit_reason: { type: 'string' },
            edit_category: {
              type: 'string',
              enum: [
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
              ]
            },
            confidence_score: {
              type: 'number',
              minimum: 0,
              maximum: 1
            },
            risk_level: {
              type: 'string',
              enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
            },
            changed_entities: {
              type: 'array',
              items: { type: 'string' }
            },
            needs_author_confirmation: {
              type: 'boolean'
            },
            editor_query: {
              type: ['string', 'null']
            }
          },
          required: [
            'original_text',
            'edited_text',
            'edit_reason',
            'edit_category',
            'confidence_score',
            'risk_level',
            'changed_entities',
            'needs_author_confirmation',
            'editor_query'
          ]
        }
      }
    }
  } as any);

  const raw = (response as { output_text?: string }).output_text?.trim();
  if (!raw) {
    throw new Error('AI returned empty response');
  }

  const parsed = aiEditSchema.parse(JSON.parse(raw));

  if (input.forceNonIdentical || (input.mustDifferFrom?.length ?? 0) > 0) {
    const disallowed = new Set((input.mustDifferFrom ?? []).map(normalizeText));
    if (input.forceNonIdentical) {
      disallowed.add(normalizeText(input.segmentText));
    }

    if (disallowed.has(normalizeText(parsed.edited_text))) {
      throw new Error('AI returned a duplicate suggestion.');
    }
  }

  return parsed;
}

export async function chatWithDocumentAssistant(input: AssistantChatInput): Promise<string> {
  const apiKey = await getConfiguredOpenAiApiKey();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Add it in .env before starting an AI editing job.');
  }

  const client = new OpenAI({ apiKey });

  const mode = input.editingMode.replaceAll('_', ' ');

  const response = await client.responses.create({
    model: env.AI_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text:
              'You are a document-aware scientific manuscript editing assistant. Answer only using supplied context. Do not invent facts or citations. If context is insufficient, say so clearly and ask for author confirmation.'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              `Editor: ${input.editorName} <${input.editorEmail}>`,
              `Editing mode: ${mode}`,
              '',
              'Specification rules:',
              ...(input.specRules.length > 0 ? input.specRules.map((rule, index) => `${index + 1}. ${rule}`) : ['[none]']),
              '',
              'Recent tracked changes:',
              input.recentChanges.length > 0
                ? input.recentChanges
                    .map(
                      (change, index) =>
                        `${index + 1}) [${change.section}] category=${change.category} confidence=${change.confidence.toFixed(2)} reason=${change.reason}\nORIGINAL: ${change.originalText}\nEDITED: ${change.editedText}`
                    )
                    .join('\n\n')
                : '[none yet]',
              '',
              'Document excerpt:',
              input.documentExcerpt || '[none]',
              '',
              `Question: ${input.question}`,
              '',
              'Return a concise, precise answer. If uncertain, explicitly say "Needs author confirmation".'
            ].join('\n')
          }
        ]
      }
    ]
  });

  const answer = (response as { output_text?: string }).output_text?.trim();
  if (!answer) {
    throw new Error('Assistant returned empty response');
  }

  return answer;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
