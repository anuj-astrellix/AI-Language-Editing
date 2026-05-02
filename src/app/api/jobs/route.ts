import { fail, ok } from '@/lib/api/responses';
import { listRecentJobs } from '@/lib/jobs/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = await listRecentJobs();
    return ok({ jobs });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to list jobs', 500);
  }
}
