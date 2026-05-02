import { aiEditSchema } from '@/lib/ai/schema';

describe('AI response schema', () => {
  it('validates structured edit output with scientific metadata', () => {
    const result = aiEditSchema.parse({
      original_text: 'Old text',
      edited_text: 'New text',
      edit_reason: 'Grammar correction',
      edit_category: 'GRAMMAR',
      confidence_score: 0.91,
      risk_level: 'LOW',
      changed_entities: [],
      needs_author_confirmation: false,
      editor_query: null
    });

    expect(result.edited_text).toBe('New text');
    expect(result.edit_category).toBe('GRAMMAR');
    expect(result.confidence_score).toBe(0.91);
  });

  it('rejects invalid risk levels', () => {
    expect(() =>
      aiEditSchema.parse({
        original_text: 'Old text',
        edited_text: 'New text',
        edit_reason: 'Reason',
        edit_category: 'STYLE',
        confidence_score: 0.7,
        risk_level: 'INVALID',
        changed_entities: [],
        needs_author_confirmation: false,
        editor_query: null
      })
    ).toThrow();
  });

  it('rejects invalid edit categories', () => {
    expect(() =>
      aiEditSchema.parse({
        original_text: 'Old text',
        edited_text: 'New text',
        edit_reason: 'Reason',
        edit_category: 'UNKNOWN',
        confidence_score: 0.7,
        risk_level: 'LOW',
        changed_entities: [],
        needs_author_confirmation: false,
        editor_query: null
      })
    ).toThrow();
  });
});
