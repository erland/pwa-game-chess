/// <reference lib="webworker" />

import type { AiMoveRequest, AiMoveResult } from '../domain/ai/types';
import { findBestMoveStrong } from '../domain/ai/strongSearch';

type EngineWorkerRequest =
  | { type: 'getMove'; request: AiMoveRequest; id: string }
  | { type: 'cancel'; id: string };

type EngineWorkerResponse =
  | { type: 'result'; id: string; result: AiMoveResult }
  | { type: 'error'; id: string; error: { message: string; name?: string } };

const cancelled = new Set<string>();

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function makeAbortError(): Error {
  const err =
    typeof DOMException !== 'undefined'
      ? new DOMException('Aborted', 'AbortError')
      : Object.assign(new Error('Aborted'), { name: 'AbortError' });
  return err;
}

function post(msg: EngineWorkerResponse) {
  (self as unknown as Worker).postMessage(msg);
}

function isCancelled(id: string): boolean {
  return cancelled.has(id);
}

function handleGetMove(id: string, request: AiMoveRequest) {
  // If already cancelled before we start, immediately report abort.
  if (isCancelled(id)) {
    post({ type: 'error', id, error: { message: 'Aborted', name: 'AbortError' } });
    cancelled.delete(id);
    return;
  }

  const env = {
    nowMs,
    shouldAbort: () => isCancelled(id)
  };

  try {
    const r = findBestMoveStrong(env, request);
    // Clear cancellation marker for this request id.
    cancelled.delete(id);
    post({ type: 'result', id, result: { move: r.move, meta: r.meta } });
  } catch (e) {
    const err = e instanceof Error ? e : new Error('Engine failed');
    // Normalize abort.
    if (isCancelled(id) || err.message === 'ABORT') {
      const ae = makeAbortError();
      cancelled.delete(id);
      post({ type: 'error', id, error: { message: ae.message, name: (ae as any).name } });
      return;
    }
    cancelled.delete(id);
    post({ type: 'error', id, error: { message: err.message, name: (err as any).name } });
  }
}

self.onmessage = (ev: MessageEvent<EngineWorkerRequest>) => {
  const msg = ev.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'cancel') {
    cancelled.add(msg.id);
    return;
  }

  if (msg.type === 'getMove') {
    // Starting a new search for the same id clears any previous cancellation.
    cancelled.delete(msg.id);
    handleGetMove(msg.id, msg.request);
  }
};
