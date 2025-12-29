import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useGlobalHotkeys } from '../../../ui/useGlobalHotkeys';
import type { Color, Move, Square } from '../../../domain/chessTypes';
import { findKing, isInCheck } from '../../../domain/attack';
import { createInitialGameState } from '../../../domain/gameState';
import type { Orientation } from '../../../domain/localSetup';
import { fromFEN } from '../../../domain/notation/fen';

import type { CoachAnalysis, CoachHint, CoachMoveGrade, ProgressiveHintLevel } from '../../../domain/coach/types';
import { getProgressiveHint } from '../../../domain/coach/hints';
import { createStrongSearchCoach } from '../../../domain/coach/strongSearchCoach';

import type { TacticItem, TrainingPack } from '../../../domain/training/schema';
import { loadAllPacks } from '../../../domain/training/packLoader';
import { makeItemKey, type TrainingItemKey } from '../../../domain/training/keys';
import { getSolutionLines, normalizeUci, progressTacticLine } from '../../../domain/training/tactics';

import { listItemStats, recordAttempt, type TrainingItemStats } from '../../../storage/training/trainingStore';
import type { TrainingMistakeRecord, TrainingSessionRecord } from '../../../storage/training/trainingSessionStore';
import {
  addTrainingMistake,
  listTrainingMistakes,
  makeMistakeId,
  makeSessionId,
  saveTrainingSession
} from '../../../storage/training/trainingSessionStore';

import { useToastNotice } from '../../game/useToastNotice';
import { useMoveInput, type PendingPromotion } from '../../../ui/chessboard/useMoveInput';

export type TacticRef = {
  pack: TrainingPack;
  item: TacticItem;
};

export type SolveState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; packs: TrainingPack[]; errors: string[] }
  | { kind: 'error'; message: string };

export type SessionState = {
  ref: TacticRef;
  attemptToken: string;
  baseState: ReturnType<typeof fromFEN>;
  state: ReturnType<typeof fromFEN>;
  userColor: Color;
  /** All solution lines (normalized UCI), from the pack item. */
  solutionLines: string[][];
  /** The chosen line after the first correct move (supports alternative first moves). */
  activeLine: string[] | null;
  /** Next expected ply index into activeLine (or solutionLines during the first move). */
  ply: number;
  /** Played line so far (including auto-played opponent replies). */
  playedLineUci: string[];
  /** Grades for each user move in this attempt (best-effort). */
  userMoveGrades: CoachMoveGrade[];
  startedAtMs: number;
  result: null | { correct: boolean; playedLineUci: string[]; solveMs: number; message?: string };
  lastMove: { from: Square; to: Square } | null;
  // coach
  analysis: CoachAnalysis | null;
  grade: CoachMoveGrade | null;
  hintLevel: 0 | ProgressiveHintLevel;
  hint: CoachHint | null;
  coachBusy: boolean;
};

export type RunState = {
  id: string;
  startedAtMs: number;
  attempted: number;
  correct: number;
  totalSolveMs: number;
  totalCpLoss: number;
  cpLossCount: number;
  gradeCounts: Record<string, number>;
  packIds: string[];
  mistakes: TrainingMistakeRecord[];
};

export type UseTacticsSessionControllerArgs = {
  reviewSessionId: string | null;
  focusKey: string | null;
};

export type UseTacticsSessionControllerResult = {
  // data
  solve: SolveState;
  session: SessionState | null;
  run: RunState | null;
  reviewSessionId: string | null;
  reviewMistakes: TrainingMistakeRecord[];
  reviewIndex: number;
  availableTacticCount: number;

  // board + input
  moveInput: ReturnType<typeof useMoveInput>;
  pendingPromotion: PendingPromotion | null;
  orientation: Orientation;
  checkSquares: Square[];
  hintMove: { from: Square; to: Square } | null;

  // derived UI
  noticeText: string | null;
  startLabel: string;
  startDisabled: boolean;
  displayedLine: string[] | null;
  progressText: string | null;

  // actions
  startNext: () => void;
  tryAgain: () => void;
  endRun: () => Promise<void>;
  giveUpShowLine: () => Promise<void>;
  showHint: (level: ProgressiveHintLevel) => Promise<void>;
  clearHint: () => void;
  goToSessionSummary: () => void;
};

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isTactic(it: any): it is TacticItem {
  return it && typeof it === 'object' && it.type === 'tactic' && Array.isArray(it.solutions);
}

function pickNextTactic(refs: TacticRef[], stats: TrainingItemStats[], ts: number): TacticRef | null {
  if (refs.length === 0) return null;

  const byKey = new Map<TrainingItemKey, TrainingItemStats>();
  for (const s of stats) byKey.set(s.key, s);

  // Prefer due items (or new items).
  const due: Array<{ ref: TacticRef; s: TrainingItemStats | null }> = [];
  for (const ref of refs) {
    const key = makeItemKey(ref.pack.id, ref.item.itemId);
    const s = byKey.get(key) ?? null;
    if (!s || (s.nextDueAtMs || 0) <= ts) {
      due.push({ ref, s });
    }
  }

  if (due.length > 0) {
    due.sort((a, b) => {
      const ad = a.s ? a.s.nextDueAtMs : 0;
      const bd = b.s ? b.s.nextDueAtMs : 0;
      if (ad !== bd) return ad - bd;
      const aa = a.s ? a.s.attempts : 0;
      const ba = b.s ? b.s.attempts : 0;
      if (aa !== ba) return aa - ba;
      return makeItemKey(a.ref.pack.id, a.ref.item.itemId).localeCompare(makeItemKey(b.ref.pack.id, b.ref.item.itemId));
    });
    return due[0].ref;
  }

  // Otherwise, pick the least-attempted item.
  const scored = refs
    .map((ref) => {
      const key = makeItemKey(ref.pack.id, ref.item.itemId);
      const s = byKey.get(key);
      return { ref, attempts: s?.attempts ?? 0, updated: s?.updatedAtMs ?? 0 };
    })
    .sort(
      (a, b) =>
        (a.attempts - b.attempts) ||
        (a.updated - b.updated) ||
        makeItemKey(a.ref.pack.id, a.ref.item.itemId).localeCompare(makeItemKey(b.ref.pack.id, b.ref.item.itemId))
    );

  return scored[0]?.ref ?? null;
}

export function useTacticsSessionController({ reviewSessionId, focusKey }: UseTacticsSessionControllerArgs): UseTacticsSessionControllerResult {
  const navigate = useNavigate();

  const [solve, setSolve] = useState<SolveState>({ kind: 'idle' });
  const [stats, setStats] = useState<TrainingItemStats[]>([]);
  const [session, setSession] = useState<SessionState | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const attemptRecordedRef = useRef<string | null>(null);
  const [reviewQueue, setReviewQueue] = useState<TacticRef[] | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewMistakes, setReviewMistakes] = useState<TrainingMistakeRecord[]>([]);

  const { noticeText, showNotice, clearNotice } = useToastNotice(1500);
  const abortRef = useRef<AbortController | null>(null);

  const coach = useMemo(() => createStrongSearchCoach(), []);
  const coachConfig = useMemo(() => ({ maxDepth: 4, thinkTimeMs: 0 }), []);

  const resetCoaching = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // Load training packs.
  useEffect(() => {
    let mounted = true;
    setSolve({ kind: 'loading' });
    void (async () => {
      try {
        const res = await loadAllPacks();
        if (!mounted) return;
        setSolve({ kind: 'ready', packs: res.packs, errors: res.errors.map((e) => e.message) });
      } catch (e) {
        if (!mounted) return;
        setSolve({ kind: 'error', message: (e as Error).message });
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Ensure any in-flight coach analysis is cancelled on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // Reload item stats periodically (and after a puzzle ends).
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const all = await listItemStats();
        if (mounted) setStats(all);
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session?.result ? 1 : 0]);

  const tacticRefs: TacticRef[] = useMemo(() => {
    if (solve.kind !== 'ready') return [];
    const out: TacticRef[] = [];
    for (const p of solve.packs) {
      for (const it of p.items) {
        if (isTactic(it)) out.push({ pack: p, item: it });
      }
    }
    out.sort((a, b) => a.pack.title.localeCompare(b.pack.title) || a.item.itemId.localeCompare(b.item.itemId));
    return out;
  }, [solve]);

  // If a review session id is provided, load its mistakes and build a deterministic queue.
  useEffect(() => {
    let mounted = true;
    if (!reviewSessionId) {
      setReviewQueue(null);
      setReviewMistakes([]);
      setReviewIndex(0);
      return;
    }
    if (solve.kind !== 'ready') return;

    void (async () => {
      try {
        const mistakes = await listTrainingMistakes(reviewSessionId);
        if (!mounted) return;
        setReviewMistakes(mistakes);

        const byPack = new Map<string, TrainingPack>();
        for (const p of solve.packs) byPack.set(p.id, p);

        const refs: TacticRef[] = [];
        for (const m of mistakes) {
          const pack = byPack.get(m.packId);
          if (!pack) continue;
          const item = pack.items.find((it) => isTactic(it) && it.itemId === m.itemId) as TacticItem | undefined;
          if (!item) continue;
          refs.push({ pack, item });
        }

        // Optional focus: bring that specific mistake to the front.
        if (focusKey) {
          const idx = mistakes.findIndex((m) => m.itemKey === focusKey);
          if (idx >= 0) {
            const wanted = refs.find((r) => makeItemKey(r.pack.id, r.item.itemId) === focusKey);
            if (wanted) {
              const filtered = refs.filter((r) => makeItemKey(r.pack.id, r.item.itemId) !== focusKey);
              refs.splice(0, refs.length, wanted, ...filtered);
            }
          }
        }

        setReviewQueue(refs);
        setReviewIndex(0);
        // While reviewing, we don't want to mix with a normal run.
        setRun(null);
      } catch {
        if (!mounted) return;
        setReviewQueue([]);
        setReviewMistakes([]);
        setReviewIndex(0);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [reviewSessionId, focusKey, solve]);

  const startSession = useCallback(
    (ref: TacticRef) => {
      resetCoaching();
      clearNotice();

      const baseState = fromFEN(ref.item.position.fen);
      const solutionLines = getSolutionLines(ref.item);
      const attemptToken = makeSessionId();
      setSelectedSquare(null);
      setPendingPromotion(null);
      setSession({
        ref,
        attemptToken,
        baseState,
        state: baseState,
        userColor: baseState.sideToMove,
        solutionLines,
        activeLine: null,
        ply: 0,
        playedLineUci: [],
        userMoveGrades: [],
        startedAtMs: nowMs(),
        result: null,
        lastMove: null,
        analysis: null,
        grade: null,
        hintLevel: 0,
        hint: null,
        coachBusy: false
      });
    },
    [clearNotice, resetCoaching]
  );

  const tryAgain = useCallback(() => {
    if (!session) return;
    resetCoaching();
    clearNotice();
    setSelectedSquare(null);
    setPendingPromotion(null);
    setSession({
      ...session,
      attemptToken: makeSessionId(),
      state: session.baseState,
      activeLine: null,
      ply: 0,
      playedLineUci: [],
      userMoveGrades: [],
      startedAtMs: nowMs(),
      result: null,
      lastMove: null,
      analysis: null,
      grade: null,
      hintLevel: 0,
      hint: null,
      coachBusy: false
    });
  }, [session, clearNotice, resetCoaching]);

  const startNext = useCallback(() => {
    // Review mode: play through the mistakes captured in a previous session.
    if (reviewSessionId) {
      if (!reviewQueue || reviewQueue.length === 0) {
        showNotice('No mistakes to review');
        return;
      }
      if (reviewIndex >= reviewQueue.length) {
        showNotice('Reached the end of the mistakes list');
        return;
      }
      const ref = reviewQueue[reviewIndex];
      setReviewIndex((i) => i + 1);
      startSession(ref);
      return;
    }

    // Normal mode: ensure we have an active run.
    if (!run) {
      setRun({
        id: makeSessionId(),
        startedAtMs: Date.now(),
        attempted: 0,
        correct: 0,
        totalSolveMs: 0,
        totalCpLoss: 0,
        cpLossCount: 0,
        gradeCounts: {},
        packIds: [],
        mistakes: []
      });
      attemptRecordedRef.current = null;
    }

    if (tacticRefs.length === 0) return;
    const next = pickNextTactic(tacticRefs, stats, Date.now());
    if (!next) return;
    startSession(next);
  }, [reviewSessionId, reviewQueue, reviewIndex, run, tacticRefs, stats, startSession, showNotice]);

  const commitMove = useCallback(
    (move: Move) => {
      if (!session || session.result) return;
      if (session.state.sideToMove !== session.userColor) return;
      resetCoaching();
      clearNotice();

      const beforeState = session.state;
      const solveMs = Math.max(0, Math.round(nowMs() - session.startedAtMs));

      const prog = progressTacticLine(beforeState, move, session.ref.item, {
        userColor: session.userColor,
        activeLine: session.activeLine,
        playedLineUci: session.playedLineUci
      });

      if (prog.kind === 'wrong' || prog.kind === 'packIllegal') {
        setSession({
          ...session,
          state: prog.state,
          activeLine: prog.kind === 'packIllegal' ? prog.activeLine : session.activeLine,
          ply: prog.ply,
          playedLineUci: prog.playedLineUci,
          result: {
            correct: false,
            playedLineUci: prog.playedLineUci,
            solveMs,
            message: prog.kind === 'packIllegal' ? prog.message : undefined
          },
          lastMove: prog.lastMove,
          hint: null,
          hintLevel: 0,
          coachBusy: true
        });

        void (async () => {
          try {
            await recordAttempt({
              packId: session.ref.pack.id,
              itemId: session.ref.item.itemId,
              success: false,
              solveMs
            });
          } catch {
            // ignore
          }

          const ac = new AbortController();
          abortRef.current = ac;
          try {
            const grade = await coach.gradeMove(beforeState, move, coachConfig, ac.signal);
            if (ac.signal.aborted) return;
            setSession((prev) => (prev ? { ...prev, grade, coachBusy: false, userMoveGrades: [...prev.userMoveGrades, grade] } : prev));
          } catch {
            if (ac.signal.aborted) return;
            setSession((prev) => (prev ? { ...prev, coachBusy: false } : prev));
          }
        })();
        return;
      }

      const complete = prog.kind === 'complete';

      setSession({
        ...session,
        state: prog.state,
        activeLine: prog.activeLine,
        ply: prog.ply,
        playedLineUci: prog.playedLineUci,
        result: complete ? { correct: true, playedLineUci: prog.playedLineUci, solveMs } : null,
        lastMove: prog.lastMove,
        hint: null,
        hintLevel: 0,
        coachBusy: true
      });

      void (async () => {
        // Always grade the user's move (best-effort).
        const ac = new AbortController();
        abortRef.current = ac;
        try {
          const grade = await coach.gradeMove(beforeState, move, coachConfig, ac.signal);
          if (ac.signal.aborted) return;
          setSession((prev) => {
            if (!prev) return prev;
            const grades = [...prev.userMoveGrades, grade];
            // Keep the "headline" grade as the worst label (highest cpLoss) if available.
            let headline = grade;
            if (grades.length > 1) {
              const sortable = grades.filter((g) => Number.isFinite(g.cpLoss));
              if (sortable.length > 0) {
                sortable.sort((a, b) => (b.cpLoss ?? 0) - (a.cpLoss ?? 0));
                headline = sortable[0];
              }
            }
            return { ...prev, grade: headline, userMoveGrades: grades, coachBusy: false };
          });
        } catch {
          if (ac.signal.aborted) return;
          setSession((prev) => (prev ? { ...prev, coachBusy: false } : prev));
        }

        // Record attempt only when the line is complete.
        if (!complete) return;
        try {
          await recordAttempt({
            packId: session.ref.pack.id,
            itemId: session.ref.item.itemId,
            success: true,
            solveMs
          });
        } catch {
          // ignore
        }
      })();
    },
    [session, resetCoaching, clearNotice, coach, coachConfig]
  );

  // Move input is shared with the main game UI. Provide a stable fallback state
  // so the hook is always called consistently even before a session is started.
  const fallbackState = useMemo(() => createInitialGameState(), []);
  const moveInput = useMoveInput({
    state: session?.state ?? fallbackState,
    selectedSquare,
    setSelectedSquare,
    pendingPromotion,
    setPendingPromotion,
    disabled: !session || Boolean(session.result),
    onMove: (move) => commitMove(move),
    showNotice,
    illegalNoticeMode: 'pseudo'
  });

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

  const orientation: Orientation = session?.baseState.sideToMove ?? 'w';
  const displayedLine = useMemo(() => {
    if (!session) return null;
    // Before the first correct move we might have multiple alternatives; show the first.
    return session.activeLine ?? session.solutionLines[0] ?? null;
  }, [session]);

  const progressText = useMemo(() => {
    if (!session || !displayedLine) return null;
    const totalUserMoves = Math.ceil(displayedLine.length / 2);
    const nextUserMoveIndex = Math.floor(session.ply / 2) + 1;
    return `Move ${Math.min(totalUserMoves, nextUserMoveIndex)} / ${totalUserMoves}`;
  }, [session, displayedLine]);

  // When a puzzle ends, update the current run summary (only in normal mode).
  useEffect(() => {
    if (!session || !session.result) return;
    if (reviewSessionId) return;
    if (!run) return;

    const token = session.attemptToken;
    if (attemptRecordedRef.current === token) return;
    attemptRecordedRef.current = token;

    const solveMs = Math.max(0, Math.round(session.result.solveMs || 0));
    const ok = !!session.result.correct;

    // Best-effort cp loss aggregation for this attempt (sum of user move grades).
    const grades = session.userMoveGrades ?? [];
    const cps = grades
      .map((g) => (Number.isFinite(g.cpLoss) ? (g.cpLoss as number) : NaN))
      .filter((n) => Number.isFinite(n));
    const cpSum = cps.reduce((a, b) => a + b, 0);
    const cpCount = cps.length;
    const label = session.grade?.label ?? (ok ? 'OK' : 'Fail');

    setRun((prev) => {
      if (!prev) return prev;
      const packs = prev.packIds.includes(session.ref.pack.id) ? prev.packIds : [...prev.packIds, session.ref.pack.id];
      const gradeCounts = { ...prev.gradeCounts, [label]: (prev.gradeCounts[label] || 0) + 1 };
      let mistakes = prev.mistakes;
      if (!ok) {
        const itemKey = makeItemKey(session.ref.pack.id, session.ref.item.itemId);
        const expectedLine = (session.activeLine ?? session.solutionLines[0] ?? []).map(normalizeUci);
        const playedLine = (session.result?.playedLineUci ?? []).map(normalizeUci);
        const createdAtMs = Date.now();
        const m: TrainingMistakeRecord = {
          id: makeMistakeId(prev.id, itemKey, createdAtMs),
          sessionId: prev.id,
          itemKey,
          packId: session.ref.pack.id,
          itemId: session.ref.item.itemId,
          fen: session.ref.item.position.fen,
          expectedLineUci: expectedLine,
          playedLineUci: playedLine,
          solveMs,
          createdAtMs,
          message: session.result?.message ?? ''
        };
        mistakes = [...mistakes, m];
      }

      return {
        ...prev,
        attempted: prev.attempted + 1,
        correct: prev.correct + (ok ? 1 : 0),
        totalSolveMs: prev.totalSolveMs + solveMs,
        totalCpLoss: prev.totalCpLoss + (cpCount > 0 ? cpSum : 0),
        cpLossCount: prev.cpLossCount + cpCount,
        gradeCounts,
        packIds: packs,
        mistakes
      };
    });
  }, [session?.result, session?.attemptToken, reviewSessionId, run]);

  const ensureAnalysis = useCallback(async (): Promise<CoachAnalysis | null> => {
    if (!session) return null;
    if (session.analysis) return session.analysis;

    const ac = new AbortController();
    abortRef.current = ac;
    setSession((prev) => (prev ? { ...prev, coachBusy: true } : prev));
    try {
      const analysis = await coach.analyze(session.state, session.state.sideToMove, coachConfig, ac.signal);
      if (ac.signal.aborted) return null;
      setSession((prev) => (prev ? { ...prev, analysis, coachBusy: false } : prev));
      return analysis;
    } catch {
      if (ac.signal.aborted) return null;
      setSession((prev) => (prev ? { ...prev, coachBusy: false } : prev));
      return null;
    }
  }, [session, coach, coachConfig]);

  const showHint = useCallback(
    async (nextLevel: ProgressiveHintLevel) => {
      const analysis = await ensureAnalysis();
      if (!analysis) return;
      const hint = getProgressiveHint(analysis, nextLevel);
      setSession((prev) => (prev ? { ...prev, hintLevel: nextLevel, hint } : prev));
    },
    [ensureAnalysis]
  );

  const clearHint = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, hint: null, hintLevel: 0 } : prev));
  }, []);

  const endRun = useCallback(async () => {
    if (!run) return;
    const endedAtMs = Date.now();
    const attempted = run.attempted;
    const avgSolveMs = attempted > 0 ? Math.round(run.totalSolveMs / attempted) : 0;
    const avgCpLoss = run.cpLossCount > 0 ? Math.round(run.totalCpLoss / run.cpLossCount) : 0;

    const record: TrainingSessionRecord = {
      id: run.id,
      mode: 'tactics',
      startedAtMs: run.startedAtMs,
      endedAtMs,
      attempted: run.attempted,
      correct: run.correct,
      totalSolveMs: run.totalSolveMs,
      avgSolveMs,
      totalCpLoss: run.totalCpLoss,
      avgCpLoss,
      gradeCounts: run.gradeCounts,
      packIds: run.packIds
    };

    try {
      await saveTrainingSession(record);
      for (const m of run.mistakes) {
        await addTrainingMistake(m);
      }
      setRun(null);
      setSession(null);
      setSelectedSquare(null);
      setPendingPromotion(null);
      navigate(`/training/session/${encodeURIComponent(record.id)}`);
    } catch {
      showNotice('Failed to save session');
    }
  }, [run, navigate, showNotice]);

  const giveUpShowLine = useCallback(async () => {
    if (!session || session.result) return;
    const solveMs = Math.max(0, Math.round(nowMs() - session.startedAtMs));
    const line = displayedLine ?? [];
    setSession({
      ...session,
      result: {
        correct: false,
        playedLineUci: session.playedLineUci,
        solveMs,
        message: line.length > 0 ? `Solution line: ${line.join(' ')}` : 'No solution line available.'
      }
    });
    try {
      await recordAttempt({
        packId: session.ref.pack.id,
        itemId: session.ref.item.itemId,
        success: false,
        solveMs
      });
    } catch {
      // ignore
    }
  }, [session, displayedLine]);

  const startLabel = reviewSessionId ? (reviewIndex === 0 ? 'Start review' : 'Next mistake') : run && run.attempted > 0 ? 'Next tactic' : 'Start tactic';

  const startDisabled = reviewSessionId ? !reviewQueue || reviewIndex >= reviewQueue.length : tacticRefs.length === 0;

  const goToSessionSummary = useCallback(() => {
    if (!reviewSessionId) return;
    navigate(`/training/session/${encodeURIComponent(reviewSessionId)}`);
  }, [navigate, reviewSessionId]);

  useGlobalHotkeys(
    [
      {
        key: 'h',
        onKey: () => {
          if (!session) return;
          const nextLevel = session.hintLevel === 0 ? 1 : ((Math.min(3, session.hintLevel + 1) as unknown) as ProgressiveHintLevel);
          void showHint(nextLevel);
        }
      },
      { key: 'n', onKey: () => startNext() },
      { key: 'r', onKey: () => tryAgain() },
      { key: 's', onKey: () => void giveUpShowLine() }
    ],
    [session, startNext, tryAgain, giveUpShowLine, showHint]
  );

  return {
    solve,
    session,
    run,
    reviewSessionId,
    reviewMistakes,
    reviewIndex,
    availableTacticCount: tacticRefs.length,

    moveInput,
    pendingPromotion,
    orientation,
    checkSquares,
    hintMove,

    noticeText,
    startLabel,
    startDisabled,
    displayedLine,
    progressText,

    startNext,
    tryAgain,
    endRun,
    giveUpShowLine,
    showHint,
    clearHint,
    goToSessionSummary
  };
}
