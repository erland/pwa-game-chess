import { useEffect, useMemo, useRef, useState } from 'react';

import type { Color, GameState, Move } from '../../domain/chessTypes';
import { generateLegalMoves } from '../../domain/legalMoves';
import type { AiConfig, AiMoveResult, ChessAi } from '../../domain/ai/types';

function cloneStateSnapshot(state: GameState): GameState {
  // GameState is JSON-serializable by design in this project.
  // A deep clone avoids subtle bugs where AI sees a mutated reference.
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function isAbortError(err: unknown): boolean {
  return Boolean(err) && typeof err === 'object' && (err as { name?: unknown }).name === 'AbortError';
}

function movesEqual(a: Move, b: Move): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    (a.promotion ?? null) === (b.promotion ?? null) &&
    Boolean(a.isCastle) === Boolean(b.isCastle) &&
    (a.castleSide ?? null) === (b.castleSide ?? null) &&
    Boolean(a.isEnPassant) === Boolean(b.isEnPassant)
  );
}

export type UseAiControllerArgs = {
  /** Toggle for enabling AI (e.g. only in vs-computer mode). */
  enabled: boolean;
  /** Current authoritative game state (from reducer). */
  state: GameState;
  /** Whether the game is over (checkmate/stalemate/resign/draw/timeout). */
  isGameOver: boolean;
  /** Which side the AI plays. */
  aiColor: Color;
  /** AI implementation. If null, no thinking occurs. */
  ai: ChessAi | null;
  /** Difficulty/config used for this game. */
  config: AiConfig;

  /** Apply a validated move through the reducer (authoritative). */
  onApplyMove: (move: Move) => void;
  /** Optional hook for surfacing AI errors (toast/logging). */
  onError?: (message: string) => void;
};

export type UseAiControllerResult = {
  isThinking: boolean;
  lastError: string | null;
  cancel: () => void;
};

/**
 * v2 Step 2: orchestrates AI thinking.
 *
 * - Requests a move when it's AI's turn.
 * - Cancels in-flight thinking on state changes/unmount.
 * - Validates AI result against generateLegalMoves before applying.
 */
export function useAiController(args: UseAiControllerArgs): UseAiControllerResult {
  const { enabled, state, isGameOver, aiColor, ai, config, onApplyMove, onError } = args;

  const [isThinking, setIsThinking] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const stateRef = useRef<GameState>(state);
  stateRef.current = state;

  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const shouldThink = enabled && !isGameOver && Boolean(ai) && state.sideToMove === aiColor;

  const cancel = useMemo(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
      setIsThinking(false);
    },
    []
  );

  useEffect(() => {
    if (!shouldThink) {
      // If it's no longer AI's turn (or AI disabled), ensure we cancel any in-flight work.
      cancel();
      return;
    }
    if (!ai) return;

    const seq = ++requestSeqRef.current;
    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;

    setIsThinking(true);
    setLastError(null);

    const snapshot = cloneStateSnapshot(state);

    const applyResult = (result: AiMoveResult) => {
      // Only apply if this is still the latest request and not aborted.
      if (ac.signal.aborted) return;
      if (seq !== requestSeqRef.current) return;

      const current = stateRef.current;
      const legal = generateLegalMoves(current);
      const match = legal.find((m) => movesEqual(m, result.move));

      if (match) {
        onApplyMove(match);
        return;
      }

      // Reducer remains authoritative: never trust AI blindly.
      if (legal.length === 0) return;
      const msg = 'AI produced an illegal move; using fallback move.';
      setLastError(msg);
      onError?.(msg);
      onApplyMove(legal[0]);
    };

    ai
      .getMove({ state: snapshot, aiColor, config, requestId: String(seq) }, ac.signal)
      .then((res) => {
        applyResult(res);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        const msg = err instanceof Error ? err.message : 'AI move failed.';
        setLastError(msg);
        onError?.(msg);
      })
      .finally(() => {
        if (seq !== requestSeqRef.current) return;
        if (ac.signal.aborted) return;
        setIsThinking(false);
      });

    return () => {
      ac.abort();
    };
    // We intentionally depend on the minimal state fields that affect turn-taking.
    // Full state changes could retrigger AI mid-search; instead we cancel via the cleanup.
  }, [ai, aiColor, cancel, config, enabled, isGameOver, shouldThink, state.sideToMove, state]);

  return { isThinking, lastError, cancel };
}
