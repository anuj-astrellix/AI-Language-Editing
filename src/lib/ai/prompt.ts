import { EditingMode } from '@/lib/jobs/types';

export const SYSTEM_PROMPT = `You are a senior scientific and technical manuscript language editor.

You must edit text as a publication-grade human editor for research manuscripts, journal submissions, and technical documents.

Hard requirements:
1. Follow the supplied editing specification and editor mode.
2. Preserve scientific meaning, technical intent, equations, units, values, names, dates, citations, references, superscripts, subscripts, and scientific symbols unless explicitly instructed otherwise.
3. Use US English conventions and Merriam-Webster style guidance.
4. Improve spelling, grammar, clarity, sentence structure, article usage, prepositions, subject-verb agreement, parallelism, punctuation, tense consistency, and professional technical readability.
5. Never hallucinate facts, citations, results, or conclusions.
6. If a wording is ambiguous or risky, set needs_author_confirmation=true and provide editor_query.
7. Preserve all non-ASCII scientific characters exactly (e.g., α, β, Δ, ±, ×, ≤, ≥) unless correction is explicitly required.
8. Return valid JSON only in the required schema.

Risk policy:
- Use HIGH or CRITICAL if numbers, dates, legal wording, names, financial values, citation content, or scientific claims are modified.
- Otherwise use LOW or MEDIUM.
`;

function modeGuidance(mode: EditingMode): string {
  switch (mode) {
    case EditingMode.GENERAL_PROFESSIONAL:
      return 'General Professional Editing: prioritize grammar, clarity, and concise professional tone.';
    case EditingMode.SCIENTIFIC_MANUSCRIPT:
      return 'Scientific Manuscript Editing: match journal-style scientific language and preserve research claims exactly.';
    case EditingMode.TECHNICAL_RESEARCH:
      return 'Technical Research Editing: improve technical precision and readability without diluting terminology.';
    case EditingMode.JOURNAL_SUBMISSION:
      return 'Journal Submission Polish: tighten style, reduce redundancy, and enforce publication-ready flow.';
    case EditingMode.GRANT_PROPOSAL:
      return 'Grant/Proposal Editing: increase persuasive clarity while preserving factual and technical integrity.';
    default:
      return 'Scientific Manuscript Editing: preserve meaning and improve publication quality language.';
  }
}

export function buildUserPrompt(input: {
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
}): string {
  const effectiveRules =
    input.specRules.length > 0
      ? input.specRules
      : [
          'Correct grammar, spelling, punctuation, and readability issues conservatively.',
          'Preserve scientific/technical meaning and terminology.',
          'Use US English and Merriam-Webster conventions.'
        ];

  const uniquenessInstructions =
    input.mustDifferFrom && input.mustDifferFrom.length > 0
      ? [
          '',
          'The edited_text must be different from each of these disallowed prior outputs:',
          ...input.mustDifferFrom.map((text, index) => `${index + 1}. ${text}`)
        ]
      : [];

  const forceChangeInstructions = input.forceNonIdentical
    ? ['', 'The edited_text must not be exactly identical to original_text unless absolutely no correction is needed.']
    : [];

  const requestNote = input.requestNote ? ['', `Additional request: ${input.requestNote}`] : [];

  return [
    'Editor identity:',
    `Name: ${input.editorName}`,
    `Email: ${input.editorEmail}`,
    '',
    'Editing mode:',
    modeGuidance(input.editingMode),
    '',
    'Editing specification rules:',
    ...effectiveRules.map((rule, index) => `${index + 1}. ${rule}`),
    '',
    'Accuracy policy:',
    '- Preserve scientific claims and factual values.',
    '- Preserve citations, references, equations, and all scientific symbols.',
    '- Preserve superscript/subscript meaning and placement.',
    '',
    `Allow meaning changes: ${input.allowMeaningChanges ? 'YES' : 'NO'}`,
    `Allow protected edits: ${input.allowProtectedEdits ? 'YES' : 'NO'}`,
    ...forceChangeInstructions,
    ...uniquenessInstructions,
    ...requestNote,
    '',
    'Context before segment:',
    input.contextBefore || '[none]',
    '',
    'Current segment text:',
    input.segmentText,
    '',
    'Context after segment:',
    input.contextAfter || '[none]',
    '',
    'Return valid JSON only with keys:',
    '- original_text',
    '- edited_text',
    '- edit_reason',
    '- edit_category',
    '- confidence_score (0 to 1)',
    '- risk_level',
    '- changed_entities (array)',
    '- needs_author_confirmation (boolean)',
    '- editor_query (string or null)'
  ].join('\n');
}
