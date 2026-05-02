import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import xpath from 'xpath';

import { EditableSegment, ParsedDocxSegments } from '@/lib/docx/types';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const select = xpath.useNamespaces({ w: WORD_NS });

export async function extractDocxSegments(docxBuffer: Buffer): Promise<ParsedDocxSegments> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const docXmlEntry = zip.file('word/document.xml');

  if (!docXmlEntry) {
    throw new Error('Invalid DOCX: missing word/document.xml');
  }

  const xmlText = await docXmlEntry.async('text');
  const xmlDoc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const paragraphNodes = select('//w:body//w:p', xmlDoc) as Node[];

  const rawSegments = paragraphNodes
    .map((paragraphNode, paragraphIndex) => buildRawSegment(paragraphNode, paragraphIndex))
    .filter((segment): segment is Omit<EditableSegment, 'segmentIndex' | 'contextBefore' | 'contextAfter'> =>
      Boolean(segment && segment.text.trim())
    );

  const segments: EditableSegment[] = rawSegments.map((segment, index, array) => {
    const prev = array[index - 1];
    const next = array[index + 1];

    return {
      ...segment,
      segmentIndex: index,
      contextBefore: prev?.text.slice(-300) ?? '',
      contextAfter: next?.text.slice(0, 300) ?? ''
    };
  });

  return {
    segments,
    paragraphCount: paragraphNodes.length
  };
}

function buildRawSegment(
  paragraphNode: Node,
  paragraphIndex: number
): Omit<EditableSegment, 'segmentIndex' | 'contextBefore' | 'contextAfter'> | null {
  const textNodes = select('.//w:t', paragraphNode) as Node[];
  const text = textNodes.map((node) => node.textContent ?? '').join('');

  if (!text.trim()) {
    return null;
  }

  const styleNode = (select('./w:pPr/w:pStyle', paragraphNode) as Element[])[0];
  const paragraphStyle = styleNode?.getAttribute('w:val') ?? styleNode?.getAttributeNS(WORD_NS, 'val') ?? undefined;

  const isHeading = Boolean(paragraphStyle && /^Heading\d?$/i.test(paragraphStyle));
  const isInTable = (select('ancestor::w:tbl', paragraphNode) as Node[]).length > 0;
  const isNumbered = (select('./w:pPr/w:numPr', paragraphNode) as Node[]).length > 0;
  const hasPageBreak = (select('.//w:br[@w:type="page"]', paragraphNode) as Node[]).length > 0;
  const hasFootnoteRef = (select('.//w:footnoteReference | .//w:endnoteReference', paragraphNode) as Node[]).length > 0;
  const hasHyperlink = (select('.//w:hyperlink', paragraphNode) as Node[]).length > 0;
  const hasFieldCode = (select('.//w:instrText', paragraphNode) as Node[]).length > 0;
  const isInStructuredDocumentTag = (select('ancestor::w:sdt', paragraphNode) as Node[]).length > 0;

  const hasSuperscript =
    (select('.//w:r[w:rPr/w:vertAlign[@w:val="superscript" or @w:val="super"]]', paragraphNode) as Node[]).length > 0;
  const hasSubscript =
    (select('.//w:r[w:rPr/w:vertAlign[@w:val="subscript" or @w:val="sub"]]', paragraphNode) as Node[]).length > 0;

  const hasSpecialCharacters = /[^\u0000-\u007f]/.test(text);
  const hasEquationLikeTokens = /[=<>±×÷^_∑√∆µα-ωΑ-Ω]|\b\d+\s*(?:mm|cm|m|kg|g|mol|mM|M|s|min|h|°C|K)\b/.test(text);

  const styleMetadata = {
    paragraphStyle,
    isHeading,
    isInTable,
    isNumbered,
    hasPageBreak,
    hasFootnoteRef,
    hasHyperlink,
    hasSuperscript,
    hasSubscript,
    hasSpecialCharacters,
    hasEquationLikeTokens
  };

  const isProtected = hasFieldCode || isInStructuredDocumentTag;

  return {
    segmentKey: `segment-${paragraphIndex}`,
    paragraphIndex,
    sectionLabel: isHeading ? text.slice(0, 80) : paragraphStyle ?? `Paragraph ${paragraphIndex + 1}`,
    text,
    styleMetadata,
    isProtected,
    isEditable: !isProtected
  };
}
