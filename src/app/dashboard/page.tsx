import Link from 'next/link';

export default function DashboardPage() {
  return (
    <section>
      <h1 className="page-title">AI Scientific & Technical Language Editing Platform</h1>
      <p className="page-subtitle">
        Publication-grade editing workflow with scientific modes, professional editor attribution, advanced track changes, live
        activity logs, and document-aware assistant chat.
      </p>

      <div className="grid two">
        <article className="card">
          <h2>Start New Manuscript Job</h2>
          <p className="muted">
            Upload DOCX, apply specification rules, choose editing mode, and run AI editing with live review controls.
          </p>
          <div className="button-row">
            <Link href="/upload" className="btn">
              Upload Document
            </Link>
            <Link href="/history" className="btn button-secondary">
              View Job History
            </Link>
          </div>
        </article>

        <article className="card">
          <h2>Workflow</h2>
          <ol>
            <li>Upload source document.</li>
            <li>Upload/paste editing specification and refine extracted rules.</li>
            <li>Set editor profile and editing mode (scientific/technical/journal/grant).</li>
            <li>Run live AI editing, review rich diffs, and accept/reject suggestions.</li>
            <li>Export clean DOCX, track changes DOCX, changelog PDF, HTML preview, and JSON audit report.</li>
          </ol>
        </article>
      </div>
    </section>
  );
}
