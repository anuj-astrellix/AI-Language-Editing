import { extractRules } from '@/lib/spec/ruleDetection';

describe('rule extraction', () => {
  it('categorizes known editing instruction lines', () => {
    const text = [
      'Use a formal professional tone.',
      'Fix grammar and punctuation issues.',
      'Do not change legal clauses or numbers.'
    ].join('\n');

    const rules = extractRules(text);

    expect(rules.length).toBe(3);
    expect(rules[0]?.category).toBe('tone');
    expect(rules[1]?.category).toBe('grammar');
    expect(rules[2]?.category).toBe('legal');
  });
});
