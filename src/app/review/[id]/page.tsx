import Link from 'next/link';

import { ReviewChangesClient } from '@/components/ReviewChangesClient';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage(context: RouteContext) {
  const { id } = await context.params;

  return (
    <section>
      <h1 className="page-title">Review Changes</h1>
      <p className="page-subtitle">
        Review publication-grade AI suggestions with rich side-by-side diff, filter by category/risk/decision, and apply
        accept/reject actions.
      </p>
      <ReviewChangesClient jobId={id} />
      <div className="button-row">
        <Link href={`/export/${id}`} className="btn">
          Continue to Export
        </Link>
      </div>
    </section>
  );
}
