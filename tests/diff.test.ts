import { buildInlineDiffHtml, containsHighRiskEntity, inferHighRiskFromTextDelta } from '@/lib/review/diff';

describe('diff helpers', () => {
  it('builds inline insertion and deletion tags', () => {
    const html = buildInlineDiffHtml('The cat sat.', 'The black cat sat.');
    expect(html).toContain('diff-ins');
  });

  it('detects high risk entities', () => {
    expect(containsHighRiskEntity(['number'])).toBe(true);
    expect(containsHighRiskEntity(['style_tone'])).toBe(false);
  });

  it('infers high risk when numbers change', () => {
    expect(inferHighRiskFromTextDelta('Payment due is 1000 USD.', 'Payment due is 1500 USD.')).toBe(true);
  });
});
