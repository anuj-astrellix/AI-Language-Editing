import { UploadDocumentClient } from '@/components/UploadDocumentClient';

export default function UploadPage() {
  return (
    <section>
      <h1 className="page-title">Upload Document</h1>
      <p className="page-subtitle">Upload the original DOCX file to initialize an AI editing workflow.</p>
      <UploadDocumentClient />
    </section>
  );
}
