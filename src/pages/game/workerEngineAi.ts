import type { AiMoveRequest, AiMoveResult, ChessAi } from '../../domain/ai/types';

type WorkerReq =
  | { type: 'getMove'; request: AiMoveRequest; id: string }
  | { type: 'cancel'; id: string };

type WorkerRes =
  | { type: 'result'; id: string; result: AiMoveResult }
  | { type: 'error'; id: string; error: { message: string; name?: string } };

function makeAbortError(): Error {
  const err =
    typeof DOMException !== 'undefined'
      ? new DOMException('Aborted', 'AbortError')
      : Object.assign(new Error('Aborted'), { name: 'AbortError' });
  return err;
}

/**
 * v2 Step 7: strong engine adapter running in a Web Worker.
 *
 * - Keeps UI responsive by doing search off-thread.
 * - Observes AbortSignal by posting a "cancel" message.
 */
export class WorkerEngineAi implements ChessAi {
  private worker: Worker | null = null;
  private pending = new Map<
    string,
    { resolve: (r: AiMoveResult) => void; reject: (e: unknown) => void }
  >();

  constructor() {
    // Lazily created in init() so tests or non-worker environments don't blow up.
  }

  async init(): Promise<void> {
    if (this.worker) return;
    if (typeof Worker === 'undefined') {
      throw new Error('Web Worker not supported in this environment');
    }

    // Vite will bundle this worker as a separate chunk.
    this.worker = new Worker(new URL('../../workers/strongEngineWorker.ts', import.meta.url), {
      type: 'module'
    });

    this.worker.onmessage = (ev: MessageEvent<WorkerRes>) => {
      const msg = ev.data;
      if (!msg || typeof msg !== 'object') return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);

      if (msg.type === 'result') {
        p.resolve(msg.result);
        return;
      }
      const e = new Error(msg.error?.message ?? 'Engine failed');
      (e as any).name = msg.error?.name;
      p.reject(e);
    };
  }

  async dispose(): Promise<void> {
    // Reject all in-flight promises.
    for (const [id, p] of this.pending) {
      p.reject(makeAbortError());
      this.pending.delete(id);
    }
    this.worker?.terminate();
    this.worker = null;
  }

  async getMove(request: AiMoveRequest, signal: AbortSignal): Promise<AiMoveResult> {
    if (!this.worker) {
      // If init was not called (or worker failed), try to init on-demand.
      await this.init();
    }
    if (!this.worker) throw new Error('Engine worker not initialized');
    if (signal.aborted) throw makeAbortError();

    const id = request.requestId ?? `w_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    return new Promise<AiMoveResult>((resolve, reject) => {
      const onAbort = () => {
        try {
          this.worker?.postMessage({ type: 'cancel', id } satisfies WorkerReq);
        } catch {
          // ignore
        }
        this.pending.delete(id);
        reject(makeAbortError());
      };

      this.pending.set(id, { resolve, reject });
      signal.addEventListener('abort', onAbort, { once: true });

      try {
        this.worker!.postMessage({ type: 'getMove', request: { ...request, requestId: id }, id } satisfies WorkerReq);
      } catch (e) {
        signal.removeEventListener('abort', onAbort);
        this.pending.delete(id);
        reject(e);
      }

      // Cleanup the abort listener when the promise settles.
      const originalResolve = resolve;
      const originalReject = reject;
      this.pending.set(id, {
        resolve: (r) => {
          signal.removeEventListener('abort', onAbort);
          originalResolve(r);
        },
        reject: (e) => {
          signal.removeEventListener('abort', onAbort);
          originalReject(e);
        }
      });
    });
  }
}

export function isWorkerEngineSupported(): boolean {
  return typeof Worker !== 'undefined';
}
