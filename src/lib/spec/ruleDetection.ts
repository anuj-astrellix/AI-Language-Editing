export interface ExtractedRule {
  id: string;
  text: string;
  category: 'tone' | 'grammar' | 'clarity' | 'terminology' | 'legal' | 'safety' | 'custom';
}

const rulePatterns: Array<{ pattern: RegExp; category: ExtractedRule['category'] }> = [
  { pattern: /tone|voice|formal|casual|professional/i, category: 'tone' },
  { pattern: /grammar|spelling|punctuation/i, category: 'grammar' },
  { pattern: /clarity|concise|readability|simplify/i, category: 'clarity' },
  { pattern: /term|terminology|consistent/i, category: 'terminology' },
  { pattern: /legal|contract|liability|clause|regulatory/i, category: 'legal' },
  { pattern: /do not change|preserve|must not alter|keep unchanged/i, category: 'safety' }
];

export function extractRules(specText: string): ExtractedRule[] {
  const lines = specText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rules: ExtractedRule[] = [];

  for (const line of lines) {
    const match = rulePatterns.find((item) => item.pattern.test(line));
    rules.push({
      id: `rule-${rules.length + 1}`,
      text: line,
      category: match?.category ?? 'custom'
    });
  }

  return rules.slice(0, 40);
}
