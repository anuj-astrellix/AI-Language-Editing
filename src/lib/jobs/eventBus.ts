import { EventEmitter } from 'node:events';

export type JobEventType =
  | 'job_started'
  | 'job_progress'
  | 'change_suggested'
  | 'job_paused'
  | 'job_resumed'
  | 'job_canceled'
  | 'job_failed'
  | 'job_completed'
  | 'decision_updated'
  | 'files_generated';

export interface JobEvent {
  type: JobEventType;
  jobId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

class JobEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(event: JobEvent): void {
    this.emitter.emit(event.jobId, event);
  }

  subscribe(jobId: string, listener: (event: JobEvent) => void): () => void {
    this.emitter.on(jobId, listener);
    return () => {
      this.emitter.off(jobId, listener);
    };
  }
}

export const jobEventBus = new JobEventBus();
