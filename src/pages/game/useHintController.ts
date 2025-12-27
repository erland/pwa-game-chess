import { useEffect, useMemo, useRef, useState } from 'react';

import type { Color, Move, Square } from '../../domain/chessTypes';
import { generateLegalMoves } from '../../domain/legalMoves';
import { HeuristicBot } from '../../domain/ai/heuristicBot';
import { toAlgebraic } from '../../domain/square';
import type { GameState } from '../../domain/chessTypes';

function parseClone<T>(state: T): T {
  // GameState is JSON-serializable by design in this project.
  // A deep clone avoids subtle bugs where AI sees a mutated reference.
  return JSON.parse(JSON.stringify(state)) as T;
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

export type HintController = {
  hintMove: { from: Square; to: Square } | null;
  hintText: string | null;
  isHintThinking: boolean;
  clearHint: () => void;
  requestHint: () => Promise<void>;
};

export function useHintController(opts: {
  enabled: boolean;
  state: GameState;
  isGameOver: boolean;
  playerColor: Color;
  aiConfig: {
    thinkTimeMs?: number;
    randomness?: number;
    maxDepth?: number;
    difficulty?: string;
  };
  blocked: boolean;
  aiIsThinking: boolean;
  showNotice: (msg: string) => void;
}): HintController {
  const { enabled, state, isGameOver, playerColor, aiConfig, blocked, aiIsThinking, showNotice } = opts;

  const [hintMove, setHintMove] = useState<{ from: Square; to: Square } | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [isHintThinking, setIsHintThinking] = useState(false);

  const hintAbortRef = useRef<AbortController | null>(null);
  const hintRequestRef = useRef(0);

  const stateRef = useRef(state);
  stateRef.current = state;

  const clearHint = () => {
    // Bump the request id so any in-flight promise result is treated as stale,
    // even if a particular AI implementation ignores AbortSignal.
    hintRequestRef.current += 1;
    hintAbortRef.current?.abort();
    hintAbortRef.current = null;
    setIsHintThinking(false);
    setHintMove(null);
    setHintText(null);
  };

  useEffect(() => {
    return () => {
      hintAbortRef.current?.abort();
    };
  }, []);

  // If any move is played (or the game ends), clear any stale hint.
  // Important: do NOT clear simply because isHintThinking flipped from true → false.
  // That would wipe the hint immediately after it resolves.
  const hintClearGuardRef = useRef<{ historyLen: number; forcedStatus: GameState['forcedStatus'] }>({
    historyLen: state.history.length,
    forcedStatus: state.forcedStatus
  });

  useEffect(() => {
    const prev = hintClearGuardRef.current;
    const changed = prev.historyLen !== state.history.length || prev.forcedStatus !== state.forcedStatus;
    hintClearGuardRef.current = { historyLen: state.history.length, forcedStatus: state.forcedStatus };

    if (!changed) return;
    // Don't wipe a hint while we're actively computing it.
    if (isHintThinking) return;

    setHintMove(null);
    setHintText(null);
  }, [state.history.length, state.forcedStatus, isHintThinking]);

  const canRequestHint = useMemo(() => {
    if (!enabled) return false;
    if (isGameOver) return false;
    if (blocked) return false;
    if (aiIsThinking) return false;
    // Only compute a hint for the player's turn.
    if (state.sideToMove !== playerColor) return false;
    return true;
  }, [enabled, isGameOver, blocked, aiIsThinking, state.sideToMove, playerColor]);

  const requestHint = async () => {
    if (!canRequestHint) return;

    // Cancel any previous hint request.
    hintAbortRef.current?.abort();
    const reqId = ++hintRequestRef.current;
    const ac = new AbortController();
    hintAbortRef.current = ac;

    const snapshot = parseClone(state);
    const snapshotHistoryLen = snapshot.history.length;
    const snapshotSideToMove = snapshot.sideToMove;

    // Use a deterministic, "best move" configuration for hints.
    // Keep it fast even if the selected difficulty is "Hard".
    const hintConfig = {
      ...aiConfig,
      difficulty: 'hard' as const,
      maxDepth: Math.max(2, aiConfig.maxDepth ?? 1),
      randomness: 0,
      thinkTimeMs: Math.max(80, Math.min(250, aiConfig.thinkTimeMs ?? 180))
    };

    setIsHintThinking(true);
    setHintMove(null);
    setHintText(null);

    try {
      // Hints should be quick and deterministic; use the baseline bot to avoid heavy computation.
      const res = await new HeuristicBot().getMove(
        {
          state: snapshot,
          aiColor: snapshotSideToMove,
          config: hintConfig,
          requestId: `hint_${reqId}`
        },
        ac.signal
      );

      // Ignore stale results.
      if (ac.signal.aborted) return;
      if (hintRequestRef.current !== reqId) return;

      // If the position changed (player made a move / AI moved), ignore the result.
      const current = stateRef.current;
      if (current.history.length !== snapshotHistoryLen) return;
      if (current.sideToMove !== snapshotSideToMove) return;

      // Validate move (defensive): it must still be legal.
      const legal = generateLegalMoves(current);
      const match = legal.find((m) => movesEqual(m, res.move));
      if (!match) {
        setIsHintThinking(false);
        showNotice('Hint unavailable');
        return;
      }

      setIsHintThinking(false);
      setHintMove({ from: match.from, to: match.to });
      setHintText(`${toAlgebraic(match.from)} → ${toAlgebraic(match.to)}`);
    } catch (e: unknown) {
      if (isAbortError(e)) return;
      setIsHintThinking(false);
      showNotice('Hint failed');
    }
  };

  return { hintMove, hintText, isHintThinking, clearHint, requestHint };
}
