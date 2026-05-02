import { validateUpload } from '@/lib/security/uploadValidation';

describe('upload validation', () => {
  it('accepts DOCX source document', () => {
    const file = new File(['test'], 'demo.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    expect(() => validateUpload(file, 'document')).not.toThrow();
  });

  it('rejects non-DOCX source document', () => {
    const file = new File(['test'], 'demo.txt', {
      type: 'text/plain'
    });

    expect(() => validateUpload(file, 'document')).toThrow();
  });
});
