import { DecisionType, GeneratedFileType } from '@/lib/jobs/types';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { rebuildDocxWithAcceptedChanges, rebuildDocxWithTrackedChanges } from '@/lib/docx/rebuilder';
import { EditableSegment } from '@/lib/docx/types';
import { getJobForRuntime, listChanges, saveGeneratedFile } from '@/lib/jobs/repository';
import { readStoredFile, storeGenerated } from '@/lib/storage/objectStorage';

interface SegmentLike {
  id: string;
  segmentKey: string;
  text: string;
  segmentIndex: number;
  sectionLabel: string | null;
}

interface ChangeLike {
  id: string;
  originalText: string;
  editedText: string;
  editReason: string;
  editCategory: string;
  confidenceScore: number;
  riskLevel: string;
  changedEntities: unknown;
  needsAuthorConfirmation: boolean;
  editorComment: string | null;
  editorName: string;
  editorEmail: string;
  editorTimestamp: string;
  revisionCycle: number;
  segment: SegmentLike;
  decisions: Array<{ decision: DecisionType }>;
}

export async function generateJobArtifacts(jobId: string): Promise<void> {
  const job = await getJobForRuntime(jobId);
  if (!job) {
    throw new Error('Job not found for artifact generation');
  }

  const sourceDocx = await readStoredFile(job.document.storagePath);
  const changes = (await listChanges(jobId)) as unknown as ChangeLike[];

  const segments: EditableSegment[] = job.segments.map((segment) => ({
    segmentKey: segment.segmentKey,
    segmentIndex: segment.segmentIndex,
    paragraphIndex: Number(segment.segmentKey.replace('segment-', '')),
    sectionLabel: segment.sectionLabel ?? `Paragraph ${segment.segmentIndex + 1}`,
    text: segment.text,
    contextBefore: segment.contextBefore ?? '',
    contextAfter: segment.contextAfter ?? '',
    styleMetadata: segment.styleMetadata as unknown as EditableSegment['styleMetadata'],
    isProtected: segment.isProtected,
    isEditable: segment.isEditable
  }));

  const acceptedTextMap: Record<string, string> = {};
  const trackedChangeMap: Record<string, { originalText: string; editedText: string; author?: string; timestamp?: string }> = {};
  const acceptedResolvedSegments = new Set<string>();
  const trackedResolvedSegments = new Set<string>();

  for (const segment of segments) {
    acceptedTextMap[segment.segmentKey] = segment.text;
  }

  for (const change of changes) {
    const segmentKey = change.segment.segmentKey;
    const decision = change.decisions[0]?.decision ?? DecisionType.PENDING;

    if (decision === DecisionType.ACCEPTED && !acceptedResolvedSegments.has(segmentKey)) {
      acceptedTextMap[segmentKey] = change.editedText;
      acceptedResolvedSegments.add(segmentKey);
    }

    if (change.editedText !== change.originalText && !trackedResolvedSegments.has(segmentKey)) {
      trackedChangeMap[segmentKey] = {
        originalText: change.originalText,
        editedText: change.editedText,
        author: `${change.editorName} <${change.editorEmail}>`,
        timestamp: change.editorTimestamp
      };
      trackedResolvedSegments.add(segmentKey);
    }
  }

  const cleanDocx = await rebuildDocxWithAcceptedChanges(sourceDocx, segments, acceptedTextMap);
  const comparisonDocx = await rebuildDocxWithTrackedChanges(
    sourceDocx,
    segments,
    trackedChangeMap,
    `${job.editorName} <${job.editorEmail}>`
  );

  const cleanPath = await storeGenerated(`${jobId}-clean.docx`, cleanDocx);
  const comparisonPath = await storeGenerated(`${jobId}-comparison.docx`, comparisonDocx);

  await saveGeneratedFile({
    jobId,
    fileType: GeneratedFileType.CLEAN_DOCX,
    storagePath: cleanPath,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    metadata: { mode: 'accepted_changes_applied' }
  });

  await saveGeneratedFile({
    jobId,
    fileType: GeneratedFileType.COMPARISON_DOCX,
    storagePath: comparisonPath,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    metadata: { mode: 'word_track_revisions' }
  });

  const htmlPreview = buildHtmlPreview(changes, jobId);
  const htmlPath = await storeGenerated(`${jobId}-preview.html`, Buffer.from(htmlPreview, 'utf-8'));

  await saveGeneratedFile({
    jobId,
    fileType: GeneratedFileType.HTML_PREVIEW,
    storagePath: htmlPath,
    mimeType: 'text/html',
    metadata: { changeCount: changes.length }
  });

  const auditJson = JSON.stringify(
    {
      jobId,
      generatedAt: new Date().toISOString(),
      editor: {
        name: job.editorName,
        email: job.editorEmail,
        companyId: job.editorCompanyId,
        signature: job.editorSignature
      },
      editingMode: job.editingMode,
      changes: changes.map((change) => ({
        id: change.id,
        segmentKey: change.segment.segmentKey,
        section: change.segment.sectionLabel,
        originalText: change.originalText,
        editedText: change.editedText,
        reason: change.editReason,
        category: change.editCategory,
        confidenceScore: change.confidenceScore,
        riskLevel: change.riskLevel,
        changedEntities: change.changedEntities,
        needsAuthorConfirmation: change.needsAuthorConfirmation,
        editorComment: change.editorComment,
        editorName: change.editorName,
        editorEmail: change.editorEmail,
        editorTimestamp: change.editorTimestamp,
        revisionCycle: change.revisionCycle,
        decision: change.decisions[0]?.decision ?? DecisionType.PENDING
      }))
    },
    null,
    2
  );

  const auditPath = await storeGenerated(`${jobId}-audit.json`, Buffer.from(auditJson, 'utf-8'));

  await saveGeneratedFile({
    jobId,
    fileType: GeneratedFileType.JSON_AUDIT,
    storagePath: auditPath,
    mimeType: 'application/json',
    metadata: { changeCount: changes.length }
  });

  const pdfBuffer = await buildPdfChangeLog(changes, jobId, `${job.editorName} <${job.editorEmail}>`);
  const pdfPath = await storeGenerated(`${jobId}-changes.pdf`, pdfBuffer);

  await saveGeneratedFile({
    jobId,
    fileType: GeneratedFileType.CHANGELOG_PDF,
    storagePath: pdfPath,
    mimeType: 'application/pdf',
    metadata: { changeCount: changes.length }
  });
}

function buildHtmlPreview(changes: ChangeLike[], jobId: string): string {
  const rows = changes
    .map(
      (change) => `
      <tr>
        <td>${escapeHtml(change.segment.sectionLabel ?? change.segment.segmentKey)}</td>
        <td>${escapeHtml(change.originalText)}</td>
        <td>${escapeHtml(change.editedText)}</td>
        <td>${escapeHtml(change.editCategory)}</td>
        <td>${escapeHtml(change.editReason)}</td>
        <td>${escapeHtml(String(change.confidenceScore))}</td>
        <td>${escapeHtml(change.riskLevel)}</td>
        <td>${escapeHtml(change.editorName)} (${escapeHtml(change.editorEmail)})</td>
        <td>${escapeHtml(change.editorTimestamp)}</td>
      </tr>
    `
    )
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Change Preview</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
      th { background: #f6f6f6; }
    </style>
  </head>
  <body>
    <h1>AI Scientific & Technical Language Editing - Change Preview</h1>
    <p><strong>Job ID:</strong> ${escapeHtml(jobId)}</p>
    <table>
      <thead>
        <tr>
          <th>Section</th>
          <th>Original</th>
          <th>Edited</th>
          <th>Category</th>
          <th>Explanation</th>
          <th>Confidence</th>
          <th>Risk</th>
          <th>Editor</th>
          <th>Timestamp</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;
}

async function buildPdfChangeLog(changes: ChangeLike[], jobId: string, editorLabel: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 36;
  const lineGap = 3;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (requiredHeight: number) => {
    if (y - requiredHeight < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  const drawTextBlock = (text: string, font: typeof regular, fontSize: number, blockSpacing = 6) => {
    const safeText = normalizeTextForPdf(text);
    const maxWidth = pageWidth - margin * 2;
    const lines = splitLines(safeText, font, fontSize, maxWidth);
    const lineHeight = fontSize + lineGap;

    ensureSpace(lines.length * lineHeight + blockSpacing);

    for (const line of lines) {
      page.drawText(line, { x: margin, y, size: fontSize, font });
      y -= lineHeight;
    }

    y -= blockSpacing;
  };

  drawTextBlock('AI Scientific & Technical Language Editing - Change Log', bold, 15, 4);
  drawTextBlock(`Job ID: ${jobId}`, regular, 10, 2);
  drawTextBlock(`Generated: ${new Date().toISOString()}`, regular, 10, 2);
  drawTextBlock(`Editor Profile: ${editorLabel}`, regular, 10, 12);

  changes.forEach((change, index) => {
    drawTextBlock(`${index + 1}. ${change.segment.sectionLabel ?? change.segment.segmentKey}`, bold, 12, 2);
    drawTextBlock(`Category: ${change.editCategory} | Confidence: ${(change.confidenceScore * 100).toFixed(1)}%`, regular, 10, 2);
    drawTextBlock(`Risk: ${change.riskLevel}`, regular, 10, 2);
    drawTextBlock(`Reason: ${change.editReason}`, regular, 10, 2);
    drawTextBlock(`Editor: ${change.editorName} (${change.editorEmail}) @ ${change.editorTimestamp}`, regular, 10, 2);
    drawTextBlock(`Original: ${change.originalText}`, regular, 10, 2);
    drawTextBlock(`Edited: ${change.editedText}`, regular, 10, 2);
    if (change.needsAuthorConfirmation) {
      drawTextBlock(`Needs author confirmation: ${change.editorComment ?? 'Ambiguous/high-risk wording.'}`, bold, 10, 2);
    }
    drawTextBlock('', regular, 10, 6);
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeTextForPdf(value: string): string {
  const greekAndMathReplacements: Array<[RegExp, string]> = [
    [/\u03b1/g, 'alpha'],
    [/\u03b2/g, 'beta'],
    [/\u03b3/g, 'gamma'],
    [/\u03b4/g, 'delta'],
    [/\u03b5/g, 'epsilon'],
    [/\u03b6/g, 'zeta'],
    [/\u03b7/g, 'eta'],
    [/\u03b8/g, 'theta'],
    [/\u03b9/g, 'iota'],
    [/\u03ba/g, 'kappa'],
    [/\u03bb/g, 'lambda'],
    [/\u03bc/g, 'mu'],
    [/\u03bd/g, 'nu'],
    [/\u03be/g, 'xi'],
    [/\u03bf/g, 'omicron'],
    [/\u03c0/g, 'pi'],
    [/\u03c1/g, 'rho'],
    [/\u03c3/g, 'sigma'],
    [/\u03c4/g, 'tau'],
    [/\u03c5/g, 'upsilon'],
    [/\u03c6/g, 'phi'],
    [/\u03c7/g, 'chi'],
    [/\u03c8/g, 'psi'],
    [/\u03c9/g, 'omega'],
    [/\u0391/g, 'Alpha'],
    [/\u0392/g, 'Beta'],
    [/\u0393/g, 'Gamma'],
    [/\u0394/g, 'Delta'],
    [/\u0398/g, 'Theta'],
    [/\u039b/g, 'Lambda'],
    [/\u039e/g, 'Xi'],
    [/\u03a0/g, 'Pi'],
    [/\u03a3/g, 'Sigma'],
    [/\u03a6/g, 'Phi'],
    [/\u03a8/g, 'Psi'],
    [/\u03a9/g, 'Omega'],
    [/\u00d7/g, 'x'],
    [/\u2212/g, '-'],
    [/\u2264/g, '<='],
    [/\u2265/g, '>='],
    [/\u2260/g, '!='],
    [/\u00b1/g, '+/-'],
    [/\u2192/g, '->'],
    [/\u2190/g, '<-'],
    [/\u2013|\u2014/g, '-'],
    [/\u2018|\u2019/g, "'"],
    [/\u201c|\u201d/g, '"'],
    [/\u00a0/g, ' ']
  ];

  let normalized = value.normalize('NFKC');
  for (const [pattern, replacement] of greekAndMathReplacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .replace(/[\r\n\t]+/g, ' ')
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
        return char;
      }
      return '?';
    })
    .join('');
}

function splitLines(
  text: string,
  font: { widthOfTextAtSize: (value: string, size: number) => number },
  size: number,
  maxWidth: number
): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  if (words.length === 0) {
    return [''];
  }

  const lines: string[] = [];
  let current = words[0] ?? '';

  for (let i = 1; i < words.length; i += 1) {
    const word = words[i] ?? '';
    const candidate = `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  lines.push(current);
  return lines;
}
