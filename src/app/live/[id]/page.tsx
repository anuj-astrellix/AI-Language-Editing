import { LiveEditorClient } from '@/components/LiveEditorClient';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export default async function LivePage(context: RouteContext) {
  const { id } = await context.params;

  return (
    <section>
      <h1 className="page-title">Live Scientific Editor</h1>
      <p className="page-subtitle">
        Stream AI edits in real time, inspect editor-attributed changes, monitor failures with full diagnostics, and use
        document-aware assistant chat.
      </p>
      <LiveEditorClient jobId={id} />
    </section>
  );
}
