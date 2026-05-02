import { JobHistoryClient } from '@/components/JobHistoryClient';

export default function HistoryPage() {
  return (
    <section>
      <h1 className="page-title">Job History</h1>
      <p className="page-subtitle">View previous document editing jobs and jump to live/review/export pages.</p>
      <JobHistoryClient />
    </section>
  );
}
