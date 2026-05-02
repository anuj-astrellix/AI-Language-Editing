export interface SegmentStyleMetadata {
  paragraphStyle?: string;
  isHeading: boolean;
  isInTable: boolean;
  isNumbered: boolean;
  hasPageBreak: boolean;
  hasFootnoteRef: boolean;
  hasHyperlink: boolean;
  hasSuperscript: boolean;
  hasSubscript: boolean;
  hasSpecialCharacters: boolean;
  hasEquationLikeTokens: boolean;
}

export interface EditableSegment {
  segmentKey: string;
  segmentIndex: number;
  paragraphIndex: number;
  sectionLabel: string;
  text: string;
  contextBefore: string;
  contextAfter: string;
  styleMetadata: SegmentStyleMetadata;
  isProtected: boolean;
  isEditable: boolean;
}

export interface ParsedDocxSegments {
  segments: EditableSegment[];
  paragraphCount: number;
}
