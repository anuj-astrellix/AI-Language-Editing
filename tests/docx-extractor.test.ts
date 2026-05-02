import { extractDocxSegments } from '@/lib/docx/extractor';
import { rebuildDocxWithAcceptedChanges } from '@/lib/docx/rebuilder';

import { buildFixtureDocx } from './utils/docxFixture';

describe('DOCX extraction and rebuild', () => {
  it('extracts segments with style metadata and context', async () => {
    const buffer = await buildFixtureDocx();
    const parsed = await extractDocxSegments(buffer);

    expect(parsed.segments.length).toBe(5);
    expect(parsed.segments[0]?.styleMetadata.isHeading).toBe(true);
    expect(parsed.segments[2]?.styleMetadata.isNumbered).toBe(true);
    expect(parsed.segments[3]?.styleMetadata.isInTable).toBe(true);
    expect(parsed.segments[1]?.contextBefore).toContain('Main Title');
    expect(parsed.segments[1]?.contextAfter).toContain('List item text');
  });

  it('rebuilds document with accepted changes while keeping segment count', async () => {
    const original = await buildFixtureDocx();
    const parsed = await extractDocxSegments(original);

    const replacement = {
      [parsed.segments[1]!.segmentKey]: 'First paragraph with value 999.'
    };

    const rebuilt = await rebuildDocxWithAcceptedChanges(original, parsed.segments, replacement);
    const reparsed = await extractDocxSegments(rebuilt);

    expect(reparsed.segments.length).toBe(parsed.segments.length);
    expect(reparsed.segments[1]?.text).toContain('999');
  });
});
