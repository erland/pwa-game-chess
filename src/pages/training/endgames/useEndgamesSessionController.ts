import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useGlobalHotkeys } from '../../../ui/useGlobalHotkeys';

import type { Color, GameState, Move, Square } from '../../../domain/chessTypes';
import { applyMove } from '../../../domain/applyMove';
import { generateLegalMoves } from '../../../domain/legalMoves';
import { findKing, isInCheck } from '../../../domain/attack';
import { tryParseFEN } from '../../../domain/notation/fen';
import { moveToUci } from '../../../domain/notation/uci';
import { getGameStatus } from '../../../domain/gameStatus';
import { cloneGameState } from '../../../domain/cloneGameState';
import { createInitialGameState } from '../../../domain/gameState';

import { createStrongSearchCoach } from '../../../domain/coach/strongSearchCoach';
import { getProgressiveHint } from '../../../domain/coach/hints';
import type { Coach, CoachAnalysis, CoachHint, CoachMoveGrade, ProgressiveHintLevel } from '../../../domain/coach/types';

import type { TrainingItemKey } from '../../../domain/training/keys';
import { makeItemKey, splitItemKey } from '../../../domain/training/keys';
import type { EndgameItem, TrainingPack } from '../../../domain/training/schema';
import { loadAllPacks } from '../../../domain/training/packLoader';
import { parseEndgameGoal, checkEndgameGoal } from '../../../domain/training/endgameGoals';
import type { EndgameCheckpoint, EndgameMoveFeedback } from '../../../domain/training/endgameDrift';
import { computeEndgameMoveFeedback, suggestAutoCheckpoint } from '../../../domain/training/endgameDrift';

import type { TrainingItemStats } from '../../../storage/training/trainingStore';
import { listItemStats, recordAttempt } from '../../../storage/training/trainingStore';

import type { TrainingMistakeRecord, TrainingSessionRecord } from '../../../storage/training/trainingSessionStore';
import { addTrainingMistake, makeMistakeId, makeSessionId, saveTrainingSession } from '../../../storage/training/trainingSessionStore';

import { useMoveInput, type PendingPromotion } from '../../../ui/chessboard/useMoveInput';

export type SolveState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; packs: TrainingPack[] }
  | { kind: 'error'; message: string };

export type EndgameRef = {
  key: TrainingItemKey;
  packId: string;
  itemId: string;
  difficulty: number;
  fen: string;
  goalText?: string;
  themes: string[];
};

export type EndgameResult = {
  success: boolean;
  message: string;
  statusKind: string;
  finishedAtMs: number;
  solveMs: number;
  sessionId?: string;
};

export type EndgameSession = {
  ref: EndgameRef;
  baseState: GameState;
  state: GameState;
  playerColor: Color;
  startedAtMs: number;
  playedLineUci: string[];
  lastMove: Move | null;
  lastMoveColor: Color | null;

  analysis: CoachAnalysis | null;
  hint: CoachHint | null;

  // Per-move grading and drift warnings
  lastGrade: CoachMoveGrade | null;
  feedback: EndgameMoveFeedback | null;
  totalCpLoss: number;
  gradedMoves: number;
  gradeCounts: Record<string, number>;

  // "Try again from key position" checkpoint
  checkpoint: EndgameCheckpoint | null;

  result: EndgameResult | null;
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

function pickNextEndgame(refs: EndgameRef[], stats: TrainingItemStats[], ts: number, focus: TrainingItemKey | null): EndgameRef | null {
  if (refs.length === 0) return null;
  if (focus) {
    const f = refs.find((r) => r.key === focus);
    if (f) return f;
  }

  const byKey = new Map<string, TrainingItemStats>();
  for (const s of stats) byKey.set(s.key, s);

  const due: EndgameRef[] = [];
  const fresh: EndgameRef[] = [];
  const seen: EndgameRef[] = [];

  for (const r of refs) {
    const st = byKey.get(r.key);
    if (!st) {
      fresh.push(r);
      continue;
    }
    const nextDue = st.nextDueAtMs ?? 0;
    if (nextDue > 0 && nextDue <= ts) due.push(r);
    else seen.push(r);
  }

  const pick = (arr: EndgameRef[]) => arr[Math.floor((ts / 997) % arr.length)];
  if (due.length) return pick(due);
  if (fresh.length) return pick(fresh);
  // fallback: least recently seen
  seen.sort((a, b) => (byKey.get(a.key)?.lastSeenAtMs ?? 0) - (byKey.get(b.key)?.lastSeenAtMs ?? 0));
  return seen[0] ?? refs[0];
}

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

  const [solve, setSolve] = useState<SolveState>({ kind: 'idle' });
  const [packs, setPacks] = useState<TrainingPack[]>([]);
  const [stats, setStats] = useState<TrainingItemStats[]>([]);
  const [session, setSession] = useState<EndgameSession | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const coachRef = useRef<Coach | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    coachRef.current = coachRef.current ?? createStrongSearchCoach();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setSolve({ kind: 'loading' });
      try {
        const [p, s] = await Promise.all([loadAllPacks(), listItemStats()]);
        if (!mounted) return;
        setPacks(p.packs);
        setStats(s);
        setSolve({ kind: 'ready', packs: p.packs });
      } catch (e: any) {
        if (!mounted) return;
        setSolve({ kind: 'error', message: String(e?.message ?? e) });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const endgameRefs = useMemo<EndgameRef[]>(() => {
    const out: EndgameRef[] = [];
    for (const p of packs) {
      for (const it of p.items) {
        if (it.type !== 'endgame') continue;
        const eg = it as EndgameItem;
        out.push({
          key: makeItemKey(p.id, eg.itemId),
          packId: p.id,
          itemId: eg.itemId,
          difficulty: eg.difficulty,
          fen: eg.position.fen,
          goalText: eg.goal,
          themes: eg.themes
        });
      }
    }
    out.sort((a, b) => (a.packId + ':' + a.itemId).localeCompare(b.packId + ':' + b.itemId));
    return out;
  }, [packs]);

  const byKeyStats = useMemo(() => {
    const m = new Map<string, TrainingItemStats>();
    for (const s of stats) m.set(s.key, s);
    return m;
  }, [stats]);

  const orientation = session?.playerColor ?? 'w';

  const checkSquares = useMemo(() => {
    if (!session) return [] as Square[];
    const stm = session.state.sideToMove;
    if (!isInCheck(session.state, stm)) return [] as Square[];
    const k = findKing(session.state, stm);
    return k == null ? [] : [k];
  }, [session]);

  const hintMove = useMemo(() => {
    if (!session?.hint) return null;
    if (session.hint.kind === 'nudge' || session.hint.kind === 'move') {
      if (session.hint.from != null && session.hint.to != null) return { from: session.hint.from, to: session.hint.to };
    }
    return null;
  }, [session?.hint]);

  const clearCoaching = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (!session) return;
    setSession({ ...session, analysis: null, hint: null });
  }, [session]);

  const dismissFeedback = useCallback(() => {
    if (!session) return;
    if (!session.feedback) return;
    setSession({ ...session, feedback: null });
  }, [session]);

  const setCheckpointNow = useCallback(
    (label = 'Checkpoint') => {
      if (!session) return;
      if (session.result) return;
      const ts = nowMs();
      const cp: EndgameCheckpoint = {
        label,
        state: cloneGameState(session.state),
        ply: session.playedLineUci.length,
        setAtMs: ts,
        scoreCp: session.lastGrade?.playedScoreCp
      };
      setSession({ ...session, checkpoint: cp });
    },
    [session]
  );

  const retryFromCheckpoint = useCallback(() => {
    if (!session) return;
    const cp = session.checkpoint;
    if (!cp) return;

    setSelectedSquare(null);
    setPendingPromotion(null);
    abortRef.current?.abort();
    abortRef.current = null;

    const ts = nowMs();
    setSession({
      ...session,
      state: cloneGameState(cp.state),
      startedAtMs: ts,
      playedLineUci: session.playedLineUci.slice(0, Math.min(session.playedLineUci.length, cp.ply)),
      lastMove: null,
      lastMoveColor: null,
      analysis: null,
      hint: null,
      lastGrade: null,
      feedback: null,
      totalCpLoss: 0,
      gradedMoves: 0,
      gradeCounts: {},
      result: null
    });
  }, [session]);

  const startEndgame = useCallback(
    async (ref?: EndgameRef | null) => {
      const ts = nowMs();
      const chosen = ref ?? pickNextEndgame(endgameRefs, stats, ts, focus);
      if (!chosen) return;

      const parsed = tryParseFEN(chosen.fen);
      if (!parsed.ok) {
        setSolve({ kind: 'error', message: `Invalid FEN for ${chosen.packId}:${chosen.itemId}: ${parsed.error}` });
        return;
      }

      setSelectedSquare(null);
      setPendingPromotion(null);
      abortRef.current?.abort();
      abortRef.current = null;

      const base = parsed.value;
      const playerColor = base.sideToMove;
      const goal = parseEndgameGoal(chosen.goalText);

      const s: EndgameSession = {
        ref: chosen,
        baseState: cloneGameState(base),
        state: cloneGameState(base),
        playerColor,
        startedAtMs: ts,
        playedLineUci: [],
        lastMove: null,
        lastMoveColor: null,
        analysis: null,
        hint: null,
        lastGrade: null,
        feedback: null,
        totalCpLoss: 0,
        gradedMoves: 0,
        gradeCounts: {},
        checkpoint: null,
        result: null
      };

      // Handle "already terminal" start positions.
      const check0 = checkEndgameGoal(base, playerColor, goal, null, null);
      if (check0.done) {
        s.result = {
          success: check0.success,
          message: check0.message,
          statusKind: check0.status.kind,
          finishedAtMs: ts,
          solveMs: 0
        };
      }

      setSession(s);
    },
    [endgameRefs, focus, stats]
  );

  const applyAndAdvance = useCallback(
    async (move: Move) => {
      if (!session) return;
      setSelectedSquare(null);
      setPendingPromotion(null);
      clearCoaching();

      const goal = parseEndgameGoal(session.ref.goalText);
      const moverColor = session.state.sideToMove;

      // evaluate player's move quality + drift (best-effort)
      let lastGrade: CoachMoveGrade | null = null;
      let feedback: EndgameMoveFeedback | null = null;
      let totalCpLoss = session.totalCpLoss;
      let gradedMoves = session.gradedMoves;
      const gradeCounts: Record<string, number> = { ...session.gradeCounts };

      if (moverColor === session.playerColor && coachRef.current) {
        try {
          const ctrl = new AbortController();
          lastGrade = await coachRef.current.gradeMove(session.state, move, { maxDepth: 3, thinkTimeMs: 0 }, ctrl.signal);
          feedback = computeEndgameMoveFeedback(goal, lastGrade);
          totalCpLoss += Math.max(0, Math.round(lastGrade.cpLoss ?? 0));
          gradedMoves += 1;
          gradeCounts[lastGrade.label] = (gradeCounts[lastGrade.label] ?? 0) + 1;
        } catch {
          // best-effort
        }
      }

      let next = applyMove(session.state, move);

      const played = session.playedLineUci.concat([moveToUci(move)]);
      let lastMove = move;
      let lastMoveColor: Color = moverColor;

      // If it's now opponent's turn, let opponent play until it's player's turn again or game ends.
      while (getGameStatus(next).kind === 'inProgress' && next.sideToMove !== session.playerColor) {
        const coach = coachRef.current;
        if (!coach) break;

        const ctrl = new AbortController();
        const candColor = next.sideToMove;
        const analysis = await coach.analyze(next, candColor, { maxDepth: 3, thinkTimeMs: 0 }, ctrl.signal);
        const bestUci = analysis.bestMoveUci ?? (analysis.pv && analysis.pv[0]) ?? null;
        if (!bestUci) break;

        const legal = generateLegalMoves(next);
        const cand = legal.find((m) => moveToUci(m) === bestUci);
        if (!cand) break;

        next = applyMove(next, cand);
        played.push(bestUci);
        lastMove = cand;
        lastMoveColor = candColor;
      }

      const check = checkEndgameGoal(next, session.playerColor, goal, lastMove, lastMoveColor);

      // automatic "key position" checkpoint
      let checkpoint = session.checkpoint;
      if (lastGrade && getGameStatus(next).kind === 'inProgress' && next.sideToMove === session.playerColor) {
        const prevAutoScore = checkpoint && checkpoint.label.startsWith('Key position') ? checkpoint.scoreCp : undefined;
        const suggestion = suggestAutoCheckpoint(goal, lastGrade.playedScoreCp, lastGrade.label, prevAutoScore);
        const canAutoUpdate = !checkpoint || checkpoint.label.startsWith('Key position');
        if (suggestion && canAutoUpdate) {
          checkpoint = {
            label: suggestion.label,
            state: cloneGameState(next),
            ply: played.length,
            setAtMs: nowMs(),
            scoreCp: suggestion.scoreCp
          };
        }
      }

      const updated: EndgameSession = {
        ...session,
        state: next,
        playedLineUci: played,
        lastMove,
        lastMoveColor,
        lastGrade,
        feedback,
        totalCpLoss,
        gradedMoves,
        gradeCounts,
        checkpoint
      };

      if (check.done) {
        const ts = nowMs();
        const solveMs = Math.max(0, ts - session.startedAtMs);

        await recordAttempt({
          packId: session.ref.packId,
          itemId: session.ref.itemId,
          success: check.success,
          solveMs,
          nowMs: ts
        });

        const sessionId = makeSessionId();
        const avgCpLoss = gradedMoves > 0 ? Math.round(totalCpLoss / gradedMoves) : 0;
        const rec: TrainingSessionRecord = {
          id: sessionId,
          mode: 'endgames',
          startedAtMs: session.startedAtMs,
          endedAtMs: ts,
          attempted: 1,
          correct: check.success ? 1 : 0,
          totalSolveMs: solveMs,
          avgSolveMs: solveMs,
          totalCpLoss,
          avgCpLoss,
          gradeCounts,
          packIds: [session.ref.packId]
        };
        await saveTrainingSession(rec);

        if (!check.success) {
          const mistake: TrainingMistakeRecord = {
            id: makeMistakeId(sessionId, session.ref.key, ts),
            sessionId,
            itemKey: session.ref.key,
            packId: session.ref.packId,
            itemId: session.ref.itemId,
            fen: session.ref.fen,
            expectedLineUci: [],
            playedLineUci: played,
            solveMs,
            createdAtMs: ts,
            message: check.message
          };
          await addTrainingMistake(mistake);
        }

        updated.result = {
          success: check.success,
          message: check.message,
          statusKind: check.status.kind,
          finishedAtMs: ts,
          solveMs,
          sessionId
        };

        setStats(await listItemStats());
      }

      setSelectedSquare(null);
      setSession(updated);
    },
    [clearCoaching, session]
  );

  const fallbackState = useMemo(() => createInitialGameState(), []);

  const moveInput = useMoveInput({
    state: session?.state ?? fallbackState,
    selectedSquare,
    setSelectedSquare,
    pendingPromotion,
    setPendingPromotion,
    disabled: !session || Boolean(session.result),
    onMove: (move) => void applyAndAdvance(move),
    illegalNoticeMode: 'none'
  });

  const showHint = useCallback(
    async (level: ProgressiveHintLevel) => {
      if (!session) return;
      if (session.result) return;
      if (!coachRef.current) return;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const analysis = await coachRef.current.analyze(session.state, session.playerColor, { maxDepth: 4, thinkTimeMs: 60 }, ctrl.signal);
        const hint = getProgressiveHint(analysis, level);
        setSession({ ...session, analysis, hint });
      } catch (e: any) {
        if (String(e?.name ?? '') === 'AbortError') return;
        setSolve({ kind: 'error', message: String(e?.message ?? e) });
      }
    },
    [session]
  );

  const giveUp = useCallback(async () => {
    if (!session) return;
    if (session.result) return;

    const ts = nowMs();
    const solveMs = Math.max(0, ts - session.startedAtMs);

    await recordAttempt({
      packId: session.ref.packId,
      itemId: session.ref.itemId,
      success: false,
      solveMs,
      nowMs: ts
    });

    const sessionId = makeSessionId();
    const avgCpLoss = session.gradedMoves > 0 ? Math.round(session.totalCpLoss / session.gradedMoves) : 0;
    const rec: TrainingSessionRecord = {
      id: sessionId,
      mode: 'endgames',
      startedAtMs: session.startedAtMs,
      endedAtMs: ts,
      attempted: 1,
      correct: 0,
      totalSolveMs: solveMs,
      avgSolveMs: solveMs,
      totalCpLoss: session.totalCpLoss,
      avgCpLoss,
      gradeCounts: session.gradeCounts,
      packIds: [session.ref.packId]
    };
    await saveTrainingSession(rec);

    const mistake: TrainingMistakeRecord = {
      id: makeMistakeId(sessionId, session.ref.key, ts),
      sessionId,
      itemKey: session.ref.key,
      packId: session.ref.packId,
      itemId: session.ref.itemId,
      fen: session.ref.fen,
      expectedLineUci: [],
      playedLineUci: session.playedLineUci,
      solveMs,
      createdAtMs: ts,
      message: 'Gave up.'
    };
    await addTrainingMistake(mistake);

    setSession({
      ...session,
      result: { success: false, message: 'Gave up.', statusKind: getGameStatus(session.state).kind, finishedAtMs: ts, solveMs, sessionId }
    });

    setStats(await listItemStats());
  }, [session]);

  const backToList = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSelectedSquare(null);
    setPendingPromotion(null);
    setSession(null);
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
