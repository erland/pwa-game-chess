import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionEffectRunner } from '../useSessionEffectRunner';

import { useGlobalHotkeys } from '../../../ui/useGlobalHotkeys';

import type { Color, GameState, Move, Square } from '../../../domain/chessTypes';
import { createInitialGameState } from '../../../domain/gameState';
import { tryParseFEN } from '../../../domain/notation/fen';

import { createStrongSearchCoach } from '../../../domain/coach/strongSearchCoach';
import type { Coach, CoachAnalysis, CoachMoveGrade, ProgressiveHintLevel } from '../../../domain/coach/types';

import type { TrainingItemKey } from '../../../domain/training/keys';
import { makeItemKey, splitItemKey } from '../../../domain/training/keys';
import type { TrainingPack } from '../../../domain/training/schema';
import { buildEndgameRefs } from '../../../domain/training/endgameRefs';
import { pickNextEndgame } from '../../../domain/training/pickers/endgamesPicker';

import { useTrainingPacks } from '../hooks/useTrainingPacks';
import { useTrainingItemStats } from '../hooks/useTrainingItemStats';

import {
  createEndgamesSessionState,
  reduceEndgamesSession
} from '../../../domain/training/session/endgamesSession';
import {
  selectEndgamesCheckSquares,
  selectEndgamesHintMove,
  selectEndgamesOrientation
} from '../../../domain/training/session/endgamesSession.selectors';
import type {
  EndgameRef,
  EndgameResult,
  EndgamesSessionEffect,
  EndgamesSessionAction,
  EndgamesSessionState
} from '../../../domain/training/session/endgamesSession.types';

import type { TrainingItemStats } from '../../../storage/training/trainingStore';

import { persistEndgameFinish } from '../../../services/training/trainingProgressRepo';

import { useMoveInput, type PendingPromotion } from '../../../ui/chessboard/useMoveInput';

export type SolveState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; packs: TrainingPack[] }
  | { kind: 'error'; message: string };

export type { EndgameRef, EndgameResult };

export type EndgameSession = EndgamesSessionState & {
  ref: EndgameRef;
  baseState: GameState;
  state: GameState;
};

export type UseEndgamesSessionControllerArgs = {
  /** Optional focus item key ("packId:itemId" or encoded form in url). */
  focusKey: string | null;
};

export type UseEndgamesSessionControllerResult = {
  // data
  solve: SolveState;
  stats: TrainingItemStats[];
  endgameRefs: EndgameRef[];
  byKeyStats: Map<string, TrainingItemStats>;

  // current session
  session: EndgameSession | null;

  // board + input
  moveInput: ReturnType<typeof useMoveInput>;
  pendingPromotion: PendingPromotion | null;
  orientation: Color;
  checkSquares: Square[];
  hintMove: { from: Square; to: Square } | null;

  // actions
  startEndgame: (ref: EndgameRef | null) => Promise<void>;
  backToList: () => void;
  showHint: (level: ProgressiveHintLevel) => Promise<void>;
  giveUp: () => Promise<void>;
  clearCoaching: () => void;
  dismissFeedback: () => void;
  setCheckpointNow: (label?: string) => void;
  retryFromCheckpoint: () => void;

  // navigation
  goToSessionSummary: (sessionId: string) => void;
};

function nowMs(): number {
  return Date.now();
}

function parseFocusKey(raw: string | null): TrainingItemKey | null {
  if (!raw) return null;
  // Accept both plain "packId:itemId" and encoded/query variants.
  const split = splitItemKey(raw);
  if (split) return makeItemKey(split.packId, split.itemId);
  // If it looks like a plain key already, use it.
  if (raw.includes(':')) return raw as TrainingItemKey;
  return null;
}

// pickNextEndgame moved to domain/training/pickers/endgamesPicker.ts

export function statusLabel(kind: string): string {
  switch (kind) {
    case 'checkmate':
      return 'Checkmate';
    case 'stalemate':
      return 'Stalemate';
    default:
      return kind;
  }
}

export function useEndgamesSessionController({ focusKey }: UseEndgamesSessionControllerArgs): UseEndgamesSessionControllerResult {
  const navigate = useNavigate();

  const focus = useMemo(() => parseFocusKey(focusKey), [focusKey]);

  const [fenError, setFenError] = useState<string | null>(null);
  const packs = useTrainingPacks();
  const solve: SolveState = useMemo(() => {
    if (fenError) return { kind: 'error', message: fenError };
    switch (packs.state.status) {
      case 'loading':
        return { kind: 'loading' };
      case 'error':
        return { kind: 'error', message: packs.state.message };
      case 'ready':
        return { kind: 'ready', packs: packs.state.packs };
      default:
        return { kind: 'loading' };
    }
  }, [packs.state, fenError]);

  const packList = packs.state.status === 'ready' ? packs.state.packs : [];

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const coachRef = useRef<Coach | null>(null);
  const gradeAbortRef = useRef<AbortController | null>(null);
  const opponentAbortRef = useRef<AbortController | null>(null);
  const hintAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    coachRef.current = coachRef.current ?? createStrongSearchCoach();
  }, []);

  const effectsRef = useRef<EndgamesSessionEffect[]>([]);
  const reducer = useCallback(
    (prev: EndgamesSessionState, action: EndgamesSessionAction): EndgamesSessionState => {
      const res = reduceEndgamesSession(prev, action);
      if (res.effects.length > 0) effectsRef.current.push(...res.effects);
      return res.state;
    },
    []
  );

  const [sessionState, dispatch] = useReducer(reducer, createEndgamesSessionState());

  const itemStats = useTrainingItemStats(sessionState.result ? 1 : 0);
  const stats = itemStats.state.status === 'ready' ? itemStats.state.stats : [];
  const byKeyStats = itemStats.byKey;

  const endgameRefs = useMemo<EndgameRef[]>(() => buildEndgameRefs(packList), [packList]);

  const session: EndgameSession | null =
    sessionState.ref && sessionState.state && sessionState.baseState ? (sessionState as unknown as EndgameSession) : null;

  const orientation = selectEndgamesOrientation(sessionState);
  const checkSquares = selectEndgamesCheckSquares(sessionState);
  const hintMove = selectEndgamesHintMove(sessionState);

  const clearCoaching = useCallback(() => {
    hintAbortRef.current?.abort();
    hintAbortRef.current = null;
    dispatch({ type: 'CLEAR_COACHING' });
  }, []);

  const dismissFeedback = useCallback(() => {
    dispatch({ type: 'DISMISS_FEEDBACK' });
  }, []);

  const setCheckpointNow = useCallback(
    (label = 'Checkpoint') => {
      dispatch({ type: 'SET_CHECKPOINT_NOW', label, nowMs: nowMs() });
    },
    []
  );

  const retryFromCheckpoint = useCallback(() => {
    setSelectedSquare(null);
    setPendingPromotion(null);

    gradeAbortRef.current?.abort();
    opponentAbortRef.current?.abort();
    hintAbortRef.current?.abort();

    gradeAbortRef.current = null;
    opponentAbortRef.current = null;
    hintAbortRef.current = null;

    dispatch({ type: 'RETRY_FROM_CHECKPOINT', nowMs: nowMs() });
  }, []);

  // Effect runner for reducer effects.
  const runEffect = useCallback(
    (eff: EndgamesSessionEffect) => {
      switch (eff.kind) {
        case 'GRADE_MOVE': {
          gradeAbortRef.current?.abort();
          const ac = new AbortController();
          gradeAbortRef.current = ac;

          void (async () => {
            try {
              const coach = coachRef.current;
              if (!coach) return;
              const grade: CoachMoveGrade = await coach.gradeMove(
                eff.beforeState,
                eff.move,
                { maxDepth: 3, thinkTimeMs: 0 },
                ac.signal
              );
              if (ac.signal.aborted) return;
              dispatch({ type: 'GRADE_RESOLVED', requestId: eff.requestId, grade, nowMs: nowMs() });
            } catch {
              if (ac.signal.aborted) return;
              dispatch({ type: 'GRADE_RESOLVED', requestId: eff.requestId, grade: null, nowMs: nowMs() });
            }
          })();
          break;
        }

        case 'ANALYZE_OPPONENT': {
          opponentAbortRef.current?.abort();
          const ac = new AbortController();
          opponentAbortRef.current = ac;

          void (async () => {
            try {
              const coach = coachRef.current;
              if (!coach) return;
              const analysis: CoachAnalysis = await coach.analyze(
                eff.state,
                eff.sideToMove,
                { maxDepth: 3, thinkTimeMs: 0 },
                ac.signal
              );
              if (ac.signal.aborted) return;
              const bestUci = analysis.bestMoveUci ?? (analysis.pv && analysis.pv[0]) ?? null;
              dispatch({
                type: 'OPPONENT_MOVE_RESOLVED',
                requestId: eff.requestId,
                bestMoveUci: bestUci,
                nowMs: nowMs()
              });
            } catch {
              if (ac.signal.aborted) return;
              dispatch({ type: 'OPPONENT_MOVE_RESOLVED', requestId: eff.requestId, bestMoveUci: null, nowMs: nowMs() });
            }
          })();
          break;
        }

        case 'ANALYZE_HINT': {
          hintAbortRef.current?.abort();
          const ac = new AbortController();
          hintAbortRef.current = ac;

          void (async () => {
            try {
              const coach = coachRef.current;
              if (!coach) return;
              const analysis: CoachAnalysis = await coach.analyze(
                eff.state,
                eff.playerColor,
                { maxDepth: 4, thinkTimeMs: 60 },
                ac.signal
              );
              if (ac.signal.aborted) return;
              dispatch({ type: 'HINT_ANALYSIS_RESOLVED', requestId: eff.requestId, analysis });
            } catch {
              if (ac.signal.aborted) return;
              dispatch({ type: 'HINT_ANALYSIS_RESOLVED', requestId: eff.requestId, analysis: null });
            }
          })();
          break;
        }

        case 'PERSIST_FINISH': {
          // Stop any in-flight coaching; we have a terminal state.
          gradeAbortRef.current?.abort();
          opponentAbortRef.current?.abort();
          hintAbortRef.current?.abort();

          gradeAbortRef.current = null;
          opponentAbortRef.current = null;
          hintAbortRef.current = null;

          void (async () => {
            const { nextStats, sessionId } = await persistEndgameFinish({
              key: eff.key,
              packId: eff.packId,
              itemId: eff.itemId,
              fen: eff.fen,
              success: eff.success,
              solveMs: eff.solveMs,
              startedAtMs: eff.startedAtMs,
              endedAtMs: eff.endedAtMs,
              totalCpLoss: eff.totalCpLoss,
              gradedMoves: eff.gradedMoves,
              gradeCounts: eff.gradeCounts,
              playedLineUci: eff.playedLineUci,
              message: eff.message
            });

            if (nextStats) itemStats.upsert(nextStats);
            dispatch({ type: 'SET_SESSION_ID', sessionId });

          })();
          break;
        }
      }
    },
    [dispatch, itemStats]
  );

  useSessionEffectRunner(effectsRef, runEffect, [sessionState]);


  const startEndgame = useCallback(
    async (ref?: EndgameRef | null) => {
      const ts = nowMs();
      const chosen = ref ?? pickNextEndgame(endgameRefs, stats, ts, focus);
      if (!chosen) return;

      const parsed = tryParseFEN(chosen.fen);
      if (!parsed.ok) {
        setFenError(`Invalid FEN for ${chosen.packId}:${chosen.itemId}: ${parsed.error}`);
        return;
      }

      setFenError(null);

      setSelectedSquare(null);
      setPendingPromotion(null);

      gradeAbortRef.current?.abort();
      opponentAbortRef.current?.abort();
      hintAbortRef.current?.abort();

      gradeAbortRef.current = null;
      opponentAbortRef.current = null;
      hintAbortRef.current = null;

      dispatch({ type: 'START', ref: chosen, baseState: parsed.value, nowMs: ts });
    },
    [endgameRefs, focus, stats]
  );

  const fallbackState = useMemo(() => createInitialGameState(), []);

  const moveInput = useMoveInput({
    state: session?.state ?? fallbackState,
    selectedSquare,
    setSelectedSquare,
    pendingPromotion,
    setPendingPromotion,
    disabled: !session || Boolean(session.result),
    onMove: (move: Move) => {
      setSelectedSquare(null);
      setPendingPromotion(null);
      dispatch({ type: 'USER_MOVE', move, nowMs: nowMs() });
    },
    illegalNoticeMode: 'none'
  });

  const showHint = useCallback(
    async (level: ProgressiveHintLevel) => {
      if (!session) return;
      if (session.result) return;
      dispatch({ type: 'REQUEST_HINT', level, nowMs: nowMs() });
    },
    [session]
  );

  const giveUp = useCallback(async () => {
    if (!session) return;
    if (session.result) return;
    dispatch({ type: 'GIVE_UP', nowMs: nowMs() });
  }, [session]);

  const backToList = useCallback(() => {
    gradeAbortRef.current?.abort();
    opponentAbortRef.current?.abort();
    hintAbortRef.current?.abort();

    gradeAbortRef.current = null;
    opponentAbortRef.current = null;
    hintAbortRef.current = null;

    setSelectedSquare(null);
    setPendingPromotion(null);

    dispatch({ type: 'BACK_TO_LIST' });
  }, []);

  const goToSessionSummary = useCallback(
    (sessionId: string) => {
      navigate(`/training/session/${encodeURIComponent(sessionId)}`);
    },
    [navigate]
  );

  // Hotkeys active during a session.
  useGlobalHotkeys(
    [
      {
        key: 'h',
        onKey: () => {
          if (!session) return;
          const kind = session.hint?.kind;
          const nextLevel: ProgressiveHintLevel = kind === 'nudge' ? 2 : kind === 'move' ? 3 : 1;
          void showHint(nextLevel);
        }
      },
      { key: 'n', onKey: () => void startEndgame(null) },
      { key: 'r', onKey: () => void startEndgame(session ? session.ref : null) },
      { key: 'c', onKey: () => setCheckpointNow() },
      { key: 'p', onKey: () => retryFromCheckpoint() },
      { key: 'g', onKey: () => void giveUp() },
      { key: 's', onKey: () => void giveUp() }
    ],
    [session, showHint, startEndgame, setCheckpointNow, retryFromCheckpoint, giveUp]
  );

  return {
    solve,
    stats,
    endgameRefs,
    byKeyStats,
    session,
    moveInput,
    pendingPromotion,
    orientation,
    checkSquares,
    hintMove,
    startEndgame,
    backToList,
    showHint,
    giveUp,
    clearCoaching,
    dismissFeedback,
    setCheckpointNow,
    retryFromCheckpoint,
    goToSessionSummary
  };
}
