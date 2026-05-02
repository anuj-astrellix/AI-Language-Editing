import { ExportClient } from '@/components/ExportClient';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export default async function ExportPage(context: RouteContext) {
  const { id } = await context.params;

  return (
    <section>
      <h1 className="page-title">Export & Download</h1>
      <p className="page-subtitle">Generate clean output, comparison files, and audit artifacts.</p>
      <ExportClient jobId={id} />
    </section>
  );
}
