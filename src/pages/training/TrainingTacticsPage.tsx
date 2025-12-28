import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useGlobalHotkeys } from '../../ui/useGlobalHotkeys';
import { useTrainingSettings } from './TrainingSettingsContext';
import type { Color, GameState, Move, Square } from '../../domain/chessTypes';
import { applyMove } from '../../domain/applyMove';
import { findKing, isInCheck } from '../../domain/attack';
import { generateLegalMoves } from '../../domain/legalMoves';
import { generatePseudoLegalMoves } from '../../domain/movegen';
import { getPiece } from '../../domain/board';
import type { Orientation } from '../../domain/localSetup';
import { fromFEN } from '../../domain/notation/fen';
import { moveToUci, parseUciMove } from '../../domain/notation/uci';

import type { CoachAnalysis, CoachHint, CoachMoveGrade, ProgressiveHintLevel } from '../../domain/coach/types';
import { createStrongSearchCoach } from '../../domain/coach/strongSearchCoach';
import { getProgressiveHint } from '../../domain/coach/hints';

import type { TacticItem, TrainingPack } from '../../domain/training/schema';
import { loadAllPacks } from '../../domain/training/packLoader';
import { makeItemKey, type TrainingItemKey } from '../../domain/training/keys';
import { getSolutionLines, normalizeUci } from '../../domain/training/tactics';
import { listItemStats, recordAttempt, type TrainingItemStats } from '../../storage/training/trainingStore';
import type { TrainingMistakeRecord, TrainingSessionRecord } from '../../storage/training/trainingSessionStore';
import {
  addTrainingMistake,
  makeMistakeId,
  makeSessionId,
  saveTrainingSession,
  listTrainingMistakes
} from '../../storage/training/trainingSessionStore';
import { useToastNotice } from '../game/useToastNotice';

import { ChessBoard } from '../../ui/ChessBoard';
import { PromotionChooser } from '../../ui/PromotionChooser';

type TacticRef = {
  pack: TrainingPack;
  item: TacticItem;
};

type PendingPromotion = {
  from: Square;
  to: Square;
  options: Move[];
};

type SolveState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; packs: TrainingPack[]; errors: string[] }
  | { kind: 'error'; message: string };

type SessionState = {
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

type RunState = {
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

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isTactic(it: any): it is TacticItem {
  return it && typeof it === 'object' && it.type === 'tactic' && Array.isArray(it.solutions);
}

function uciToLegalMove(state: GameState, uci: string): Move | null {
  const parsed = parseUciMove(uci);
  if (!parsed) return null;

  const candidates = generateLegalMoves(state, parsed.from).filter((m) => m.to === parsed.to);
  if (candidates.length === 0) return null;

  if (parsed.promotion) {
    const p = parsed.promotion;
    const promo = candidates.find((m) => String(m.promotion).toLowerCase() === p);
    return promo ?? null;
  }

  // Prefer non-promotion move if UCI doesn't include a promotion suffix.
  const nonPromo = candidates.find((m) => !m.promotion);
  return nonPromo ?? candidates[0] ?? null;
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
    .sort((a, b) => (a.attempts - b.attempts) || (a.updated - b.updated) || makeItemKey(a.ref.pack.id, a.ref.item.itemId).localeCompare(makeItemKey(b.ref.pack.id, b.ref.item.itemId)));

  return scored[0]?.ref ?? null;
}

export function TrainingTacticsPage() {

  const { settings } = useTrainingSettings();
  const showHintSquares = settings.hintStyle === 'squares' || settings.hintStyle === 'both';
  const showHintArrow = settings.hintStyle === 'arrow' || settings.hintStyle === 'both';

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reviewSessionId = searchParams.get('reviewSession');
  const focusKey = searchParams.get('focus');

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

  useEffect(() => {
    let mounted = true;
    setSolve({ kind: 'loading' });
    void (async () => {
      try {
        const res = await loadAllPacks();
        if (!mounted) return;
        setSolve({
          kind: 'ready',
          packs: res.packs,
          errors: res.errors.map((e) => e.message)
        });
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
    out.sort((a, b) => (a.pack.title.localeCompare(b.pack.title) || a.item.itemId.localeCompare(b.item.itemId)));
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

  const legalMovesFromSelection = useMemo(() => {
    if (!session || selectedSquare == null) return [] as Move[];
    return generateLegalMoves(session.state, selectedSquare);
  }, [session, selectedSquare]);

  function resetCoaching() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  function startSession(ref: TacticRef) {
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
  }

  function startNext() {
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
  }

  function tryAgain() {
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
  }

  function commitMove(move: Move) {
    if (!session || session.result) return;
    if (session.state.sideToMove !== session.userColor) return;
    resetCoaching();
    clearNotice();

    const playedUci = normalizeUci(moveToUci(move));

    const line = session.activeLine
      ?? session.solutionLines.find((l) => l[session.ply] === playedUci)
      ?? null;

    const beforeState = session.state;
    const applied = applyMove(beforeState, move);
    const solveMs = Math.max(0, Math.round(nowMs() - session.startedAtMs));

    // Wrong move ends the attempt.
    if (!line) {
      setSession({
        ...session,
        state: applied,
        result: { correct: false, playedLineUci: [...session.playedLineUci, playedUci], solveMs },
        lastMove: { from: move.from, to: move.to },
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

    // Correct move: advance ply and auto-play opponent replies.
    let nextState = applied;
    let nextPly = session.ply + 1;
    let nextPlayed = [...session.playedLineUci, playedUci];
    let lastMove: { from: Square; to: Square } | null = { from: move.from, to: move.to };
    let activeLine = session.activeLine ?? line;

    // Auto-play any expected opponent moves until it's user's turn again or line ends.
    while (nextPly < activeLine.length && nextState.sideToMove !== session.userColor) {
      const expectedUci = activeLine[nextPly];
      const om = uciToLegalMove(nextState, expectedUci);
      if (!om) {
        setSession({
          ...session,
          state: nextState,
          activeLine,
          ply: nextPly,
          playedLineUci: nextPlayed,
          result: {
            correct: false,
            playedLineUci: nextPlayed,
            solveMs,
            message: `Pack line contains an illegal move at ply ${nextPly + 1}: ${expectedUci}`
          },
          lastMove,
          hint: null,
          hintLevel: 0
        });
        return;
      }
      nextState = applyMove(nextState, om);
      nextPlayed = [...nextPlayed, normalizeUci(expectedUci)];
      lastMove = { from: om.from, to: om.to };
      nextPly++;
    }

    const complete = nextPly >= activeLine.length;

    setSession({
      ...session,
      state: nextState,
      userColor: session.userColor,
      solutionLines: session.solutionLines,
      activeLine,
      ply: nextPly,
      playedLineUci: nextPlayed,
      result: complete ? { correct: true, playedLineUci: nextPlayed, solveMs } : null,
      lastMove,
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
      const end = complete;
      if (!end) return;
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
  }

  function tryApplyCandidates(from: Square, to: Square, candidates: Move[]) {
    if (!session || session.result) return;

    // Promotions generate multiple legal moves for the same (from,to) with different piece types.
    const promo = candidates.filter((m) => m.promotion);
    if (promo.length > 0) {
      setPendingPromotion({ from, to, options: promo });
      return;
    }

    if (candidates.length > 0) {
      commitMove(candidates[0]);
      setSelectedSquare(null);
    }
  }

  function handleSquareClick(square: Square) {
    if (!session) return;
    if (session.result) return;
    if (pendingPromotion) return;

    const piece = getPiece(session.state.board, square);
    const isOwnPiece = piece != null && piece.color === session.state.sideToMove;

    if (selectedSquare === null) {
      if (isOwnPiece) setSelectedSquare(square);
      return;
    }

    if (square === selectedSquare) {
      setSelectedSquare(null);
      return;
    }

    if (isOwnPiece) {
      setSelectedSquare(square);
      return;
    }

    const from = selectedSquare;
    const candidates = generateLegalMoves(session.state, from).filter((m) => m.to === square);
    if (candidates.length === 0) {
      const pseudo = generatePseudoLegalMoves(session.state, from).filter((m) => m.to === square);
      showNotice(pseudo.length > 0 ? 'King would be in check' : 'Illegal move');
      return;
    }

    tryApplyCandidates(from, square, candidates);
  }

  function handleMoveAttempt(from: Square, to: Square, candidates: Move[]) {
    if (!session) return;
    if (session.result) return;
    if (pendingPromotion) return;

    if (candidates.length === 0) {
      const pseudo = generatePseudoLegalMoves(session.state, from).filter((m) => m.to === to);
      showNotice(pseudo.length > 0 ? 'King would be in check' : 'Illegal move');
      setSelectedSquare(from);
      return;
    }

    tryApplyCandidates(from, to, candidates);
  }

  async function ensureAnalysis(): Promise<CoachAnalysis | null> {
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
  }

  async function showHint(nextLevel: ProgressiveHintLevel) {
    const analysis = await ensureAnalysis();
    if (!analysis) return;
    const hint = getProgressiveHint(analysis, nextLevel);
    setSession((prev) => (prev ? { ...prev, hintLevel: nextLevel, hint } : prev));
  }

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
    const cps = grades.map((g) => (Number.isFinite(g.cpLoss) ? (g.cpLoss as number) : NaN)).filter((n) => Number.isFinite(n));
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

  async function endRun() {
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
  }

  async function giveUpShowLine() {
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
  }

  const startLabel = reviewSessionId
    ? (reviewIndex === 0 ? 'Start review' : 'Next mistake')
    : (run && run.attempted > 0 ? 'Next tactic' : 'Start tactic');

  const startDisabled = reviewSessionId
    ? (!reviewQueue || reviewIndex >= reviewQueue.length)
    : (tacticRefs.length === 0);

  
  useGlobalHotkeys(
    [
      {
        key: 'h',
        onKey: () => {
          if (!session) return;
          const nextLevel = session.hintLevel === 0 ? 1 : (Math.min(3, session.hintLevel + 1) as any);
          showHint(nextLevel);
        }
      },
      { key: 'n', onKey: () => startNext() },
      { key: 'r', onKey: () => tryAgain() },
      { key: 's', onKey: () => giveUpShowLine() }
    ],
    [session, startNext, tryAgain, giveUpShowLine]
  );

return (
    <section className="stack">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tactics (multi-move lines)</h3>
        <p className="muted">
          Solve puzzles by playing the best move(s). Some puzzles include expected opponent replies, so you may need to
          find a line (not just one move).
        </p>

        {solve.kind === 'loading' && <p>Loading packs…</p>}
        {solve.kind === 'error' && <p className="muted">Failed to load packs: {solve.message}</p>}

        {solve.kind === 'ready' && (
          <>
            {solve.errors.length > 0 && (
              <div className="notice" role="note" style={{ marginTop: 12 }}>
                <strong>Pack warnings</strong>
                <ul>
                  {solve.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="actions" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-primary" onClick={startNext} disabled={startDisabled}>
                {startLabel}
              </button>
              {session && (
                <button type="button" className="btn btn-secondary" onClick={tryAgain} disabled={!session || !!session.result}>
                  Reset
                </button>
              )}
              {!reviewSessionId && run && run.attempted > 0 && (
                <button type="button" className="btn btn-secondary" onClick={endRun}>
                  End session
                </button>
              )}
              {reviewSessionId && (
                <button type="button" className="btn btn-secondary" onClick={() => navigate(`/training/session/${encodeURIComponent(reviewSessionId)}`)}>
                  Session summary
                </button>
              )}
            </div>

            <p className="muted" style={{ marginTop: 8 }}>
              {reviewSessionId ? (
                <>
                  Reviewing mistakes: <strong>{reviewMistakes.length}</strong> · Progress: <strong>{Math.min(reviewIndex, reviewMistakes.length)}</strong> /{' '}
                  <strong>{reviewMistakes.length}</strong>
                </>
              ) : (
                <>
                  Available tactics: <strong>{tacticRefs.length}</strong>
                  {run && run.attempted > 0 && (
                    <>
                      {' '}
                      · Session: <strong>{run.correct}</strong> / <strong>{run.attempted}</strong>
                    </>
                  )}
                </>
              )}
            </p>
          </>
        )}
      </div>

      {session && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <h3 style={{ margin: 0 }}>Puzzle</h3>
              <p className="muted" style={{ marginTop: 6 }}>
                Pack: <strong>{session.ref.pack.title}</strong> · Difficulty: <strong>{session.ref.item.difficulty}</strong>
              </p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div className="muted">Side to move</div>
              <div className="metaValue">{session.baseState.sideToMove === 'w' ? 'White' : 'Black'}</div>
            </div>
          </div>

          {session.ref.item.goal && (
            <div className="notice" role="note" style={{ marginTop: 12 }}>
              <strong>Goal:</strong> {session.ref.item.goal}
            </div>
          )}

          {(progressText || displayedLine) && (
            <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
              {progressText ? (
                <>
                  Progress: <strong>{progressText}</strong>
                </>
              ) : null}
              {displayedLine ? (
                <>
                  {progressText ? ' · ' : ''}
                  Line length: <strong>{displayedLine.length}</strong> ply
                </>
              ) : null}
            </p>
          )}

          {session.playedLineUci.length > 0 && (
            <p className="muted" style={{ marginTop: 6 }}>
              Played: <code>{session.playedLineUci.join(' ')}</code>
            </p>
          )}

          <ChessBoard
            state={session.state}
            orientation={orientation}
            selectedSquare={selectedSquare}
            legalMovesFromSelection={legalMovesFromSelection}
            hintMove={hintMove}
            showHintSquares={showHintSquares}
            showHintArrow={showHintArrow}
            lastMove={session.lastMove}
            checkSquares={checkSquares}
            onSquareClick={handleSquareClick}
            onMoveAttempt={handleMoveAttempt}
            disabled={!!session.result}
          />

          {noticeText && (
            <div className="toast" role="status" aria-live="polite">
              {noticeText}
            </div>
          )}

          <div className="actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => showHint(1)}
              disabled={!!session.result || session.coachBusy}
            >
              Hint 1
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => showHint(2)}
              disabled={!!session.result || session.coachBusy}
            >
              Hint 2
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => showHint(3)}
              disabled={!!session.result || session.coachBusy}
            >
              Hint 3
            </button>
            {session.hint && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSession((prev) => (prev ? { ...prev, hint: null, hintLevel: 0 } : prev))}
                disabled={!!session.result || session.coachBusy}
              >
                Clear hint
              </button>
            )}

            <button type="button" className="btn btn-secondary" onClick={giveUpShowLine} disabled={!!session.result}>
              Show line
            </button>
          </div>

          {session.hint && session.hint.kind === 'line' && (
            <div className="notice" role="note" style={{ marginTop: 12 }}>
              <strong>Line:</strong> <code>{session.hint.pv.join(' ')}</code>
            </div>
          )}

          {session.result && (
            <div className="notice" role="note" style={{ marginTop: 12 }}>
              {session.result.correct ? (
                <>
                  ✅ <strong>Correct!</strong> ({session.result.solveMs} ms)
                </>
              ) : (
                <>
                  ❌ <strong>Not the expected move.</strong> ({session.result.solveMs} ms)
                </>
              )}

              {session.result.message && (
                <div style={{ marginTop: 8 }}>
                  <span className="muted">{session.result.message}</span>
                </div>
              )}

              {session.grade && (
                <div style={{ marginTop: 8 }}>
                  Coach grade: <strong>{session.grade.label}</strong>
                  {Number.isFinite(session.grade.cpLoss) && (
                    <>
                      {' '}
                      · cp loss: <strong>{session.grade.cpLoss}</strong>
                    </>
                  )}
                  {session.grade.bestMoveUci && (
                    <>
                      {' '}
                      · best: <code>{session.grade.bestMoveUci}</code>
                    </>
                  )}
                </div>
              )}

              <div className="actions" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-primary" onClick={startNext}>
                  Next
                </button>
                <button type="button" className="btn btn-secondary" onClick={tryAgain}>
                  Try again
                </button>
              </div>
            </div>
          )}

          <p className="muted" style={{ marginTop: 12 }}>
            Tap to move, or drag a piece to a highlighted square.
          </p>

          {pendingPromotion && (
            <PromotionChooser
              color={session.state.sideToMove}
              options={pendingPromotion.options}
              onChoose={(m) => {
                setPendingPromotion(null);
                commitMove(m);
              }}
              onCancel={() => setPendingPromotion(null)}
            />
          )}
        </div>
      )}
    </section>
  );
}
