'use client';

import { Fragment, useMemo } from 'react';
import { diffLines, diffWordsWithSpace } from 'diff';

interface HighlightedChangeProps {
  originalText: string;
  editedText: string;
  diffHtml?: string;
  compact?: boolean;
}

interface DiffToken {
  value: string;
  added?: boolean;
  removed?: boolean;
}

interface SplitDiffRow {
  operation: 'context' | 'add' | 'del' | 'update';
  oldNo: number | null;
  newNo: number | null;
  oldTokens: DiffToken[];
  newTokens: DiffToken[];
}

interface DiffModel {
  rows: SplitDiffRow[];
  additions: number;
  deletions: number;
  updates: number;
  hasChanges: boolean;
}

export function HighlightedChange({ originalText, editedText, compact = false }: HighlightedChangeProps) {
  const model = useMemo(() => buildSplitDiffModel(originalText, editedText), [originalText, editedText]);

  return (
    <div className={`change-highlight rich-diff ${compact ? 'compact' : ''}`}>
      <div className="diff-summary-row">
        <span className="op-pill op-add">+ {model.additions} additions</span>
        <span className="op-pill op-del">- {model.deletions} deletions</span>
        <span className="op-pill op-update">~ {model.updates} updates</span>
      </div>

      {!model.hasChanges ? <p className="no-diff-note">No textual edits in this suggestion.</p> : null}

      <div className="split-diff-wrap">
        <table className="split-diff-table">
          <thead>
            <tr>
              <th colSpan={2}>Source Document</th>
              <th colSpan={2}>AI Updated Document</th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row, index) => (
              <tr key={`split-${index}`} className={`split-row ${row.operation}`}>
                <td className="split-line-no">{row.oldNo ?? ''}</td>
                <td className="split-line-text">{renderTokens(row.oldTokens, 'old')}</td>
                <td className="split-line-no">{row.newNo ?? ''}</td>
                <td className="split-line-text">{renderTokens(row.newTokens, 'new')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderTokens(tokens: DiffToken[], side: 'old' | 'new') {
  if (tokens.length === 0) {
    return <span className="split-empty"> </span>;
  }

  return tokens.map((token, index) => {
    if (side === 'old' && token.removed) {
      return (
        <mark key={`${side}-${index}`} className="word-del strong-del">
          {token.value}
        </mark>
      );
    }

    if (side === 'new' && token.added) {
      return (
        <mark key={`${side}-${index}`} className="word-add strong-add">
          {token.value}
        </mark>
      );
    }

    return <Fragment key={`${side}-${index}`}>{token.value}</Fragment>;
  });
}

function buildSplitDiffModel(originalText: string, editedText: string): DiffModel {
  const parts = diffLines(originalText, editedText);
  const rows: SplitDiffRow[] = [];

  let additions = 0;
  let deletions = 0;
  let updates = 0;

  let oldNo = 1;
  let newNo = 1;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part) {
      continue;
    }

    if (part.removed && parts[index + 1]?.added) {
      const removedLines = splitIntoLines(part.value);
      const addedLines = splitIntoLines(parts[index + 1]?.value ?? '');
      const pairCount = Math.max(removedLines.length, addedLines.length);

      for (let rowIndex = 0; rowIndex < pairCount; rowIndex += 1) {
        const left = removedLines[rowIndex];
        const right = addedLines[rowIndex];

        if (left !== undefined && right !== undefined) {
          const tokenized = tokenizeUpdate(left, right);
          rows.push({
            operation: 'update',
            oldNo,
            newNo,
            oldTokens: tokenized.oldTokens,
            newTokens: tokenized.newTokens
          });
          updates += 1;
          oldNo += 1;
          newNo += 1;
        } else if (left !== undefined) {
          rows.push({
            operation: 'del',
            oldNo,
            newNo: null,
            oldTokens: [{ value: left, removed: true }],
            newTokens: []
          });
          deletions += 1;
          oldNo += 1;
        } else if (right !== undefined) {
          rows.push({
            operation: 'add',
            oldNo: null,
            newNo,
            oldTokens: [],
            newTokens: [{ value: right, added: true }]
          });
          additions += 1;
          newNo += 1;
        }
      }

      index += 1;
      continue;
    }

    if (part.removed) {
      for (const line of splitIntoLines(part.value)) {
        rows.push({
          operation: 'del',
          oldNo,
          newNo: null,
          oldTokens: [{ value: line, removed: true }],
          newTokens: []
        });
        deletions += 1;
        oldNo += 1;
      }
      continue;
    }

    if (part.added) {
      for (const line of splitIntoLines(part.value)) {
        rows.push({
          operation: 'add',
          oldNo: null,
          newNo,
          oldTokens: [],
          newTokens: [{ value: line, added: true }]
        });
        additions += 1;
        newNo += 1;
      }
      continue;
    }

    for (const line of splitIntoLines(part.value)) {
      rows.push({
        operation: 'context',
        oldNo,
        newNo,
        oldTokens: [{ value: line }],
        newTokens: [{ value: line }]
      });
      oldNo += 1;
      newNo += 1;
    }
  }

  return {
    rows,
    additions,
    deletions,
    updates,
    hasChanges: additions + deletions + updates > 0
  };
}

function tokenizeUpdate(oldLine: string, newLine: string): { oldTokens: DiffToken[]; newTokens: DiffToken[] } {
  const parts = diffWordsWithSpace(oldLine, newLine);

  return {
    oldTokens: parts
      .filter((part) => !part.added)
      .map((part) => ({ value: part.value, removed: Boolean(part.removed) })),
    newTokens: parts
      .filter((part) => !part.removed)
      .map((part) => ({ value: part.value, added: Boolean(part.added) }))
  };
}

function splitIntoLines(value: string): string[] {
  const normalized = value.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.length > 0 ? lines : [''];
}
