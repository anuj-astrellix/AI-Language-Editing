import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';
import xpath from 'xpath';

import { EditableSegment } from '@/lib/docx/types';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const select = xpath.useNamespaces({ w: WORD_NS });

interface AcceptedTextBySegment {
  [segmentId: string]: string;
}

interface TrackedChangeBySegment {
  [segmentId: string]: {
    originalText: string;
    editedText: string;
    author?: string;
    timestamp?: string;
  };
}

export async function rebuildDocxWithAcceptedChanges(
  originalDocx: Buffer,
  segments: EditableSegment[],
  acceptedText: AcceptedTextBySegment
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(originalDocx);
  const docXmlEntry = zip.file('word/document.xml');

  if (!docXmlEntry) {
    throw new Error('Invalid DOCX: missing word/document.xml');
  }

  const xmlText = await docXmlEntry.async('text');
  const xmlDoc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const paragraphNodes = select('//w:body//w:p', xmlDoc) as Node[];

  for (const segment of segments) {
    const replacement = acceptedText[segment.segmentKey];
    if (typeof replacement !== 'string') {
      continue;
    }

    const paragraphNode = paragraphNodes[segment.paragraphIndex];
    if (!paragraphNode) {
      continue;
    }

    const textNodes = select('.//w:t', paragraphNode) as Node[];
    if (textNodes.length === 0) {
      continue;
    }

    redistributeTextAcrossNodesWithLocks(textNodes, replacement);
  }

  const serializer = new XMLSerializer();
  const updatedXml = serializer.serializeToString(xmlDoc);
  zip.file('word/document.xml', updatedXml);

  return zip.generateAsync({ type: 'nodebuffer' });
}

export async function rebuildDocxWithTrackedChanges(
  originalDocx: Buffer,
  segments: EditableSegment[],
  trackedChanges: TrackedChangeBySegment,
  author = 'AI Language Editor'
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(originalDocx);
  const docXmlEntry = zip.file('word/document.xml');

  if (!docXmlEntry) {
    throw new Error('Invalid DOCX: missing word/document.xml');
  }

  const xmlText = await docXmlEntry.async('text');
  const xmlDoc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const paragraphNodes = select('//w:body//w:p', xmlDoc) as Node[];

  let revisionId = 1;

  for (const segment of segments) {
    const change = trackedChanges[segment.segmentKey];
    if (!change) {
      continue;
    }

    if (normalizeText(change.originalText) === normalizeText(change.editedText)) {
      continue;
    }

    const paragraphNode = paragraphNodes[segment.paragraphIndex];
    if (!paragraphNode) {
      continue;
    }

    const originalChildren = collectParagraphNonPropertyChildren(paragraphNode);
    clearParagraphContent(paragraphNode);

    const revisionAuthor = change.author?.trim() || author;
    const revisionDate = normalizeTimestamp(change.timestamp);

    const delNode = buildDeletionNodeFromParagraph(xmlDoc, revisionId, revisionAuthor, revisionDate, originalChildren, change.originalText);
    revisionId += 1;

    const insNode = buildInsertionNodeFromParagraph(xmlDoc, revisionId, revisionAuthor, revisionDate, originalChildren, change.editedText);
    revisionId += 1;

    paragraphNode.appendChild(delNode);
    paragraphNode.appendChild(insNode);
  }

  const serializer = new XMLSerializer();
  const updatedXml = serializer.serializeToString(xmlDoc);
  zip.file('word/document.xml', updatedXml);

  await ensureTrackRevisionsEnabled(zip);

  return zip.generateAsync({ type: 'nodebuffer' });
}

function redistributeTextAcrossNodesWithLocks(textNodes: Node[], replacement: string): void {
  const lockIndexes = new Set<number>();
  const lockTokens: string[] = [];

  for (let index = 0; index < textNodes.length; index += 1) {
    const node = textNodes[index];
    if (isTextNodeInSupOrSubRun(node)) {
      lockIndexes.add(index);
      lockTokens.push(node.textContent ?? '');
    }
  }

  if (lockIndexes.size === 0) {
    redistributeTextAcrossNodes(textNodes, replacement);
    return;
  }

  const unlockedNodes: Node[] = [];
  for (let index = 0; index < textNodes.length; index += 1) {
    if (!lockIndexes.has(index)) {
      unlockedNodes.push(textNodes[index]);
    }
  }

  if (unlockedNodes.length === 0) {
    return;
  }

  const removed = removeLockedTokensOnce(replacement, lockTokens);

  // If lock tokens cannot be located in replacement text, fall back to full
  // redistribution so we avoid duplicate symbols while preserving run styles.
  if (!removed.allTokensRemoved) {
    redistributeTextAcrossNodes(textNodes, replacement);
    return;
  }

  redistributeTextAcrossNodes(unlockedNodes, removed.text);
}

function redistributeTextAcrossNodes(textNodes: Node[], replacement: string): void {
  const originalLengths = textNodes.map((node) => (node.textContent ?? '').length || 1);
  const totalLength = originalLengths.reduce((sum, value) => sum + value, 0);

  let cursor = 0;

  for (let index = 0; index < textNodes.length; index += 1) {
    const node = textNodes[index];

    if (index === textNodes.length - 1) {
      node.textContent = replacement.slice(cursor);
      break;
    }

    const share = Math.max(1, Math.floor((originalLengths[index] / totalLength) * replacement.length));
    node.textContent = replacement.slice(cursor, cursor + share);
    cursor += share;
  }
}

function removeLockedTokensOnce(
  replacement: string,
  lockedTokens: string[]
): { text: string; allTokensRemoved: boolean } {
  let result = replacement;
  let allTokensRemoved = true;

  for (const token of lockedTokens) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      continue;
    }

    const position = result.indexOf(normalizedToken);
    if (position < 0) {
      allTokensRemoved = false;
      continue;
    }

    result = `${result.slice(0, position)}${result.slice(position + normalizedToken.length)}`;
  }

  return {
    text: result,
    allTokensRemoved
  };
}

function collectParagraphNonPropertyChildren(paragraphNode: Node): Node[] {
  const children = Array.from(paragraphNode.childNodes ?? []);
  return children.filter((child) => !isParagraphPropertiesNode(child)).map((child) => child.cloneNode(true));
}

function clearParagraphContent(paragraphNode: Node): void {
  const children = Array.from(paragraphNode.childNodes ?? []);

  for (const child of children) {
    if (isParagraphPropertiesNode(child)) {
      continue;
    }

    paragraphNode.removeChild(child);
  }
}

function isParagraphPropertiesNode(node: Node): boolean {
  if ((node as Element).localName) {
    return (node as Element).localName === 'pPr';
  }

  return node.nodeName === 'w:pPr';
}

function buildDeletionNodeFromParagraph(
  xmlDoc: Document,
  id: number,
  author: string,
  dateIso: string,
  paragraphChildren: Node[],
  fallbackText: string
): Element {
  const del = xmlDoc.createElementNS(WORD_NS, 'w:del');
  del.setAttribute('w:id', String(id));
  del.setAttribute('w:author', author);
  del.setAttribute('w:date', dateIso);

  const runTemplates = extractRunTemplates(paragraphChildren);

  if (runTemplates.length === 0) {
    del.appendChild(buildFallbackDeletionRun(xmlDoc, fallbackText));
    return del;
  }

  for (const template of runTemplates) {
    const runClone = template.cloneNode(true) as Element;
    convertRunTextNodesToDeletion(runClone, xmlDoc);
    del.appendChild(runClone);
  }

  return del;
}

function buildInsertionNodeFromParagraph(
  xmlDoc: Document,
  id: number,
  author: string,
  dateIso: string,
  paragraphChildren: Node[],
  editedText: string
): Element {
  const ins = xmlDoc.createElementNS(WORD_NS, 'w:ins');
  ins.setAttribute('w:id', String(id));
  ins.setAttribute('w:author', author);
  ins.setAttribute('w:date', dateIso);

  const runTemplates = extractRunTemplates(paragraphChildren);

  if (runTemplates.length === 0) {
    ins.appendChild(buildFallbackInsertionRun(xmlDoc, editedText));
    return ins;
  }

  const insertionRuns = runTemplates.map((template) => template.cloneNode(true) as Element);
  const textNodes: Node[] = [];

  for (const run of insertionRuns) {
    textNodes.push(...((select('.//w:t', run) as Node[]) ?? []));
  }

  if (textNodes.length === 0) {
    ins.appendChild(buildFallbackInsertionRun(xmlDoc, editedText));
    return ins;
  }

  redistributeTextAcrossNodesWithLocks(textNodes, editedText);

  for (const run of insertionRuns) {
    ins.appendChild(run);
  }

  return ins;
}

function extractRunTemplates(paragraphChildren: Node[]): Element[] {
  const runs: Element[] = [];

  for (const child of paragraphChildren) {
    const localName = (child as Element).localName ?? child.nodeName;

    if (localName === 'r' || localName === 'w:r') {
      runs.push(child as Element);
      continue;
    }

    const childRuns = (select('.//w:r', child) as Element[]) ?? [];
    for (const run of childRuns) {
      runs.push(run);
    }
  }

  return runs;
}

function convertRunTextNodesToDeletion(runNode: Element, xmlDoc: Document): void {
  const textNodes = (select('.//w:t', runNode) as Element[]) ?? [];

  if (textNodes.length === 0) {
    return;
  }

  for (const textNode of textNodes) {
    const delText = xmlDoc.createElementNS(WORD_NS, 'w:delText');
    delText.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    delText.appendChild(xmlDoc.createTextNode(textNode.textContent ?? ''));

    const parent = textNode.parentNode;
    if (parent) {
      parent.replaceChild(delText, textNode);
    }
  }
}

function buildFallbackDeletionRun(xmlDoc: Document, value: string): Element {
  const run = xmlDoc.createElementNS(WORD_NS, 'w:r');
  const delText = xmlDoc.createElementNS(WORD_NS, 'w:delText');
  delText.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  delText.appendChild(xmlDoc.createTextNode(value));
  run.appendChild(delText);
  return run;
}

function buildFallbackInsertionRun(xmlDoc: Document, value: string): Element {
  const run = xmlDoc.createElementNS(WORD_NS, 'w:r');
  const text = xmlDoc.createElementNS(WORD_NS, 'w:t');
  text.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  text.appendChild(xmlDoc.createTextNode(value));
  run.appendChild(text);
  return run;
}

function isTextNodeInSupOrSubRun(textNode: Node): boolean {
  const run = findAncestorRun(textNode);
  if (!run) {
    return false;
  }

  return (
    (select('./w:rPr/w:vertAlign[@w:val="superscript" or @w:val="super"]', run) as Node[]).length > 0 ||
    (select('./w:rPr/w:vertAlign[@w:val="subscript" or @w:val="sub"]', run) as Node[]).length > 0
  );
}

function findAncestorRun(node: Node): Node | null {
  let current: Node | null = node;

  while (current) {
    const localName = (current as Element).localName ?? current.nodeName;
    if (localName === 'r' || localName === 'w:r') {
      return current;
    }
    current = current.parentNode;
  }

  return null;
}

async function ensureTrackRevisionsEnabled(zip: JSZip): Promise<void> {
  const settingsEntry = zip.file('word/settings.xml');
  if (!settingsEntry) {
    return;
  }

  const settingsXml = await settingsEntry.async('text');
  const settingsDoc = new DOMParser().parseFromString(settingsXml, 'application/xml');
  const settingsNode = (select('//w:settings', settingsDoc) as Node[])[0];
  if (!settingsNode) {
    return;
  }

  const existing = select('./w:trackRevisions', settingsNode) as Node[];
  if (existing.length > 0) {
    return;
  }

  const trackRevisionsNode = settingsDoc.createElementNS(WORD_NS, 'w:trackRevisions');
  settingsNode.appendChild(trackRevisionsNode);

  const serializer = new XMLSerializer();
  const updatedSettingsXml = serializer.serializeToString(settingsDoc);
  zip.file('word/settings.xml', updatedSettingsXml);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTimestamp(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}
