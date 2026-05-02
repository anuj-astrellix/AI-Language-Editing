import { jobEventBus } from '@/lib/jobs/eventBus';
import { getJobStatus } from '@/lib/jobs/service';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown): void => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      void getJobStatus(id)
        .then((job) => {
          send({
            type: 'snapshot',
            jobId: id,
            status: job.status,
            progress: job.progressPercent,
            currentSegmentIndex: job.currentSegmentIndex,
            totalSegments: job.totalSegments,
            currentSectionLabel: job.currentSectionLabel,
            errorMessage: job.errorMessage,
            editingMode: job.editingMode,
            editorName: job.editorName,
            editorEmail: job.editorEmail
          });
        })
        .catch(() => {
          send({
            type: 'error',
            message: 'Unable to load initial job snapshot'
          });
        });

      const unsubscribe = jobEventBus.subscribe(id, (event) => {
        send(event);
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 15000);

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
