import type { AiMoveRequest, AiMoveResult, ChessAi } from './types';
import { findBestMoveStrong, type StrongSearchEnv } from './strongSearch';

function isAbortError(err: unknown): boolean {
  return Boolean(err) && typeof err === 'object' && (err as { name?: unknown }).name === 'AbortError';
}

function abortIfNeeded(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const err =
    typeof DOMException !== 'undefined'
      ? new DOMException('Aborted', 'AbortError')
      : Object.assign(new Error('Aborted'), { name: 'AbortError' });
  throw err;
}

/**
 * Fallback strong engine that runs on the main thread.
 *
 * Step 7's preferred implementation is `WorkerEngineAi` (UI layer), but tests and
 * non-worker environments can still use this.
 */
export class StrongEngineBot implements ChessAi {
  async getMove(request: AiMoveRequest, signal: AbortSignal): Promise<AiMoveResult> {
    abortIfNeeded(signal);

    const env: StrongSearchEnv = {
      nowMs: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      shouldAbort: () => signal.aborted
    };

    try {
      const r = findBestMoveStrong(env, request);
      return { move: r.move, meta: r.meta };
    } catch (e) {
      // Translate "ABORT" or other abort-like signals into AbortError for callers.
      if (signal.aborted || isAbortError(e)) abortIfNeeded(signal);
      throw e;
    }
  }
}
