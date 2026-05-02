import { Suspense } from 'react';

import { SpecificationClient } from '@/components/SpecificationClient';

export default function SpecificationPage() {
  return (
    <section>
      <h1 className="page-title">Editing Specification</h1>
      <p className="page-subtitle">
        Upload or paste instructions, configure editor profile and scientific mode, refine extracted rules, and start the AI
        editing job.
      </p>
      <Suspense fallback={<div className="card">Loading specification workspace...</div>}>
        <SpecificationClient />
      </Suspense>
    </section>
  );
}
