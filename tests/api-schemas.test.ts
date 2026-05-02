import { assistantQuestionSchema, editorProfileSchema, startJobSchema } from '@/lib/api/schemas';

describe('API schemas', () => {
  it('accepts supported editing modes for start job', () => {
    const parsed = startJobSchema.parse({
      documentId: '8aeea5ac-0a7d-4f29-a7b6-64d5934af2aa',
      specificationId: 'df4aa903-40c9-4ce2-b768-f26f05f70834',
      editingMode: 'SCIENTIFIC_MANUSCRIPT'
    });

    expect(parsed.editingMode).toBe('SCIENTIFIC_MANUSCRIPT');
  });

  it('rejects invalid editing mode', () => {
    expect(() =>
      startJobSchema.parse({
        documentId: '8aeea5ac-0a7d-4f29-a7b6-64d5934af2aa',
        specificationId: 'df4aa903-40c9-4ce2-b768-f26f05f70834',
        editingMode: 'INVALID_MODE'
      })
    ).toThrow();
  });

  it('validates editor profile payload', () => {
    const parsed = editorProfileSchema.parse({
      name: 'Meenakshi Sharma',
      email: 'barthwal.meenakshi@gmail.com',
      companyId: 'LANG-EDITOR-01',
      signature: 'Meenakshi Sharma'
    });

    expect(parsed.email).toContain('@');
  });

  it('validates assistant chat question', () => {
    const parsed = assistantQuestionSchema.parse({
      question: 'Why was this changed to passive voice?'
    });

    expect(parsed.question.length).toBeGreaterThan(2);
  });
});
