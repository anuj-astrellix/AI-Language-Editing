import { diffWords } from 'diff';

export function buildInlineDiffHtml(originalText: string, editedText: string): string {
  const diff = diffWords(originalText, editedText);

  return diff
    .map((part) => {
      if (part.added) {
        return `<ins class=\"diff-ins\">${escapeHtml(part.value)}</ins>`;
      }
      if (part.removed) {
        return `<del class=\"diff-del\">${escapeHtml(part.value)}</del>`;
      }
      return `<span>${escapeHtml(part.value)}</span>`;
    })
    .join('');
}

export function containsHighRiskEntity(changedEntities: string[]): boolean {
  return changedEntities.some((entity) => ['number', 'date', 'legal_term', 'name', 'financial_value', 'citation'].includes(entity));
}

export function inferHighRiskFromTextDelta(originalText: string, editedText: string): boolean {
  const numberRegex = /\b\d+(?:[.,]\d+)?\b/g;
  const dateRegex = /\b(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})\b/g;
  const citationRegex = /\[[0-9]+\]|\([A-Z][a-z]+,\s*\d{4}\)/g;
  const legalRegex = /\bshall\b|\bhereby\b|\bindemnif(?:y|ication)\b|\bliability\b/i;

  return (
    collectMatches(originalText, numberRegex) !== collectMatches(editedText, numberRegex) ||
    collectMatches(originalText, dateRegex) !== collectMatches(editedText, dateRegex) ||
    collectMatches(originalText, citationRegex) !== collectMatches(editedText, citationRegex) ||
    legalRegex.test(originalText) !== legalRegex.test(editedText)
  );
}

function collectMatches(text: string, pattern: RegExp): string {
  return (text.match(pattern) ?? []).join('|');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
