// A queue of render jobs run in a Web Worker, or in small slices on the main
// thread where workers are not available.
import { handleRequest } from './handle.ts';
import type { RenderRequest, RenderResponse } from './protocol.ts';

type Pending = (res: RenderResponse) => void;
type NewRequest = RenderRequest extends infer R ? (R extends RenderRequest ? Omit<R, 'job'> : never) : never;

export class Renderer {
  private worker: Worker | null = null;
  private nextJob = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly sent = new Map<number, RenderRequest>();
  private readonly fallbackQueue: RenderRequest[] = [];
  private fallbackBusy = false;

  constructor(useWorker = true) {
    if (useWorker && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent<RenderResponse>) => this.settle(e.data);
        this.worker.onerror = () => this.fallBack();
      } catch {
        this.worker = null;
      }
    }
  }

  render(req: NewRequest): Promise<RenderResponse> {
    const full = { ...req, job: this.nextJob++ } as RenderRequest;
    return new Promise((resolve) => {
      this.pending.set(full.job, resolve);
      if (this.worker) {
        this.sent.set(full.job, full);
        this.worker.postMessage(full);
      } else this.enqueue(full);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
    this.sent.clear();
    this.fallbackQueue.length = 0;
  }

  private settle(res: RenderResponse): void {
    const p = this.pending.get(res.job);
    this.pending.delete(res.job);
    this.sent.delete(res.job);
    p?.(res);
  }

  /** The worker failed to load: render everything still pending here instead. */
  private fallBack(): void {
    this.worker?.terminate();
    this.worker = null;
    console.warn('Audio render worker unavailable; rendering on the main thread.');
    const resend = [...this.sent.values()];
    this.sent.clear();
    for (const req of resend) this.enqueue(req);
  }

  private enqueue(req: RenderRequest): void {
    this.fallbackQueue.push(req);
    if (!this.fallbackBusy) this.pump();
  }

  private pump(): void {
    const req = this.fallbackQueue.shift();
    if (!req) {
      this.fallbackBusy = false;
      return;
    }
    this.fallbackBusy = true;
    setTimeout(() => {
      this.settle(handleRequest(req));
      this.pump();
    }, 0);
  }
}
