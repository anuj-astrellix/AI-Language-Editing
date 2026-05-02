import { JobStatus } from '@/lib/jobs/types';

import { getJobDetails, setJobStatus } from '@/lib/jobs/repository';
import { runEditingJob } from '@/lib/jobs/runner';

class EditingQueue {
  private pending = new Set<string>();
  private running = false;

  enqueue(jobId: string): void {
    this.pending.add(jobId);
    void this.process();
  }

  private async process(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      while (this.pending.size > 0) {
        const [jobId] = this.pending;
        if (!jobId) {
          break;
        }

        this.pending.delete(jobId);

        const job = await getJobDetails(jobId);
        if (!job) {
          continue;
        }

        if (job.status === JobStatus.CANCELED || job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
          continue;
        }

        if (job.status === JobStatus.PAUSED) {
          continue;
        }

        await setJobStatus(jobId, JobStatus.RUNNING);
        await runEditingJob(jobId);
      }
    } finally {
      this.running = false;
    }
  }
}

export const editingQueue = new EditingQueue();
