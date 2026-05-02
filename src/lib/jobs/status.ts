import { JobStatus } from '@/lib/jobs/types';

export function canTransition(current: JobStatus, next: JobStatus): boolean {
  if (current === next) {
    return true;
  }

  const transitions: Record<JobStatus, JobStatus[]> = {
    [JobStatus.PENDING]: [JobStatus.RUNNING, JobStatus.CANCELED, JobStatus.FAILED],
    [JobStatus.RUNNING]: [JobStatus.PAUSED, JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELED],
    [JobStatus.PAUSED]: [JobStatus.RUNNING, JobStatus.CANCELED, JobStatus.FAILED],
    [JobStatus.COMPLETED]: [],
    [JobStatus.FAILED]: [],
    [JobStatus.CANCELED]: []
  };

  return transitions[current].includes(next);
}
