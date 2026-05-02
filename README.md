# AI Scientific & Technical Language Editor

Production-grade Next.js platform for manuscript-level language editing with:

- DOCX upload and rule-spec upload (DOCX/PDF/TXT/pasted text)
- scientific/technical editing modes
- professional editor attribution on every suggestion
- live job streaming with failure diagnostics and full activity timeline
- side-by-side rich diff review with accept/reject and regenerate
- Word-compatible track changes DOCX export (`w:ins` / `w:del`)
- document-aware assistant chat for "why changed" and refinement requests

## Core Capabilities

- **Editor profile** (default preloaded):
  - Name: `Meenakshi Sharma`
  - Email: `barthwal.meenakshi@gmail.com`
  - editable from UI (`/specification`)
- **Editing modes**:
  - General Professional Editing
  - Scientific Manuscript Editing
  - Technical Research Editing
  - Journal Submission Polish
  - Grant/Proposal Editing
- **Tracked change metadata per suggestion**:
  - original text
  - revised text
  - category
  - explanation
  - confidence score
  - risk level
  - needs-author-confirmation query (if ambiguous/high-risk)
  - editor name/email/timestamp
  - revision cycle
- **Exports**:
  - clean edited DOCX
  - track changes DOCX
  - PDF change log
  - HTML change preview
  - JSON audit log

## Stack

- Next.js 16 + React + TypeScript
- OpenAI Responses API (JSON-schema constrained output)
- DOCX parsing/rebuild: JSZip + xmldom + XPath
- Diff engine: `diff`
- Spec extraction: `mammoth`, `pdf-parse`
- Validation: `zod`
- Storage/DB mode: local filesystem JSON store + local object storage adapters

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

See `.env.example`:

- `OPENAI_API_KEY`
- `DATABASE_URL` (optional, filesystem mode is default)
- `STORAGE_BUCKET`
- `MAX_UPLOAD_MB`
- `AI_MODEL`
- `NEXT_PUBLIC_APP_NAME`

You can also set runtime OpenAI key from the UI (`/specification`) via **OpenAI Key Setup**.

## API Surface

### Documents & Specs
- `POST /api/documents/upload`
- `POST /api/specifications/upload`
- `POST /api/specifications/:id/rules`

### Editor Profile
- `GET /api/editor-profile`
- `POST /api/editor-profile`

### Job Lifecycle
- `POST /api/jobs/start`
- `POST /api/jobs/:id/pause`
- `POST /api/jobs/:id/resume`
- `POST /api/jobs/:id/cancel`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/stream`
- `GET /api/jobs/:id/activity`

### Changes & Review
- `GET /api/jobs/:id/segments`
- `GET /api/jobs/:id/changes`
- `POST /api/jobs/:id/changes/:changeId/accept`
- `POST /api/jobs/:id/changes/:changeId/reject`
- `POST /api/jobs/:id/changes/:changeId/regenerate`
- `POST /api/jobs/:id/changes/accept-all`
- `POST /api/jobs/:id/changes/reject-all`

### Assistant Chat
- `POST /api/jobs/:id/chat`

### Export
- `POST /api/jobs/:id/generate`
- `GET /api/jobs/:id/download?type=clean|comparison|changelog|preview|audit`

### History
- `GET /api/jobs`

## UI Pages

- `/dashboard`
- `/upload`
- `/specification`
- `/live/:id`
- `/review/:id`
- `/export/:id`
- `/history`

## Testing

```bash
npm test
```

Includes tests for:
- schema validation
- rule extraction
- DOCX segment extraction
- diff/high-risk detection
- upload validation
- status transitions

## Notes

- Filesystem mode is default; no PostgreSQL is required for local usage.
- Queue execution is in-process for now; for horizontal scale, move to a dedicated worker/queue backend.
- PDF logs normalize unsupported WinAnsi symbols (Greek/math) to safe textual forms.
