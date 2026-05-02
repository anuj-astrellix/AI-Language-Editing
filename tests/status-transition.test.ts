import { canTransition } from '@/lib/jobs/status';
import { JobStatus } from '@/lib/jobs/types';

describe('job status transitions', () => {
  it('allows running to paused', () => {
    expect(canTransition(JobStatus.RUNNING, JobStatus.PAUSED)).toBe(true);
  });

  it('blocks completed to running', () => {
    expect(canTransition(JobStatus.COMPLETED, JobStatus.RUNNING)).toBe(false);
  });
});
