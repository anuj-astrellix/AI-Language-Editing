import { extractSpecificationText } from '@/lib/spec/specExtractor';

describe('specification extraction', () => {
  it('prefers pasted text when provided', async () => {
    const result = await extractSpecificationText(null, 'Use formal tone.');

    expect(result.sourceType).toBe('TEXT');
    expect(result.extractedText).toContain('formal tone');
  });

  it('extracts text from TXT files', async () => {
    const file = new File(['Rule A\nRule B'], 'spec.txt', { type: 'text/plain' });
    const result = await extractSpecificationText(file, null);

    expect(result.sourceType).toBe('TXT');
    expect(result.extractedText).toContain('Rule A');
  });
});
