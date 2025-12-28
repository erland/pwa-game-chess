import { useEffect, useMemo, useRef, useState } from 'react';

import type { Move, Square } from '../../domain/chessTypes';
import { applyMove } from '../../domain/applyMove';
import { findKing, isInCheck } from '../../domain/attack';
import { generateLegalMoves } from '../../domain/legalMoves';
import { generatePseudoLegalMoves } from '../../domain/movegen';
import { getPiece } from '../../domain/board';
import type { Orientation } from '../../domain/localSetup';
import { fromFEN } from '../../domain/notation/fen';
import { moveToUci } from '../../domain/notation/uci';

import type { CoachAnalysis, CoachHint, CoachMoveGrade, ProgressiveHintLevel } from '../../domain/coach/types';
import { createStrongSearchCoach } from '../../domain/coach/strongSearchCoach';
import { getProgressiveHint } from '../../domain/coach/hints';

import type { TacticItem, TrainingPack } from '../../domain/training/schema';
import { loadBuiltInPacks } from '../../domain/training/packLoader';
import { makeItemKey, type TrainingItemKey } from '../../domain/training/keys';
import { listItemStats, recordAttempt, type TrainingItemStats } from '../../storage/training/trainingStore';
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
  baseState: ReturnType<typeof fromFEN>;
  state: ReturnType<typeof fromFEN>;
  startedAtMs: number;
  result: null | { correct: boolean; playedUci: string; solveMs: number };
  lastMove: { from: Square; to: Square } | null;
  // coach
  analysis: CoachAnalysis | null;
  grade: CoachMoveGrade | null;
  hintLevel: 0 | ProgressiveHintLevel;
  hint: CoachHint | null;
  coachBusy: boolean;
};

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isTactic(it: any): it is TacticItem {
  return it && typeof it === 'object' && it.type === 'tactic' && Array.isArray(it.solutions);
}

function normalizeUci(s: string): string {
  return (s ?? '').trim().toLowerCase();
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
  const [solve, setSolve] = useState<SolveState>({ kind: 'idle' });
  const [stats, setStats] = useState<TrainingItemStats[]>([]);
  const [session, setSession] = useState<SessionState | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const { noticeText, showNotice, clearNotice } = useToastNotice(1500);
  const abortRef = useRef<AbortController | null>(null);

  const coach = useMemo(() => createStrongSearchCoach(), []);
  const coachConfig = useMemo(() => ({ maxDepth: 4, thinkTimeMs: 0 }), []);

  useEffect(() => {
    let mounted = true;
    setSolve({ kind: 'loading' });
    void (async () => {
      try {
        const res = await loadBuiltInPacks();
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
  }, [session?.result?.correct]);

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
    setSelectedSquare(null);
    setPendingPromotion(null);
    setSession({
      ref,
      baseState,
      state: baseState,
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
      state: session.baseState,
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
    resetCoaching();
    clearNotice();

    const playedUci = normalizeUci(moveToUci(move));
    const ok = session.ref.item.solutions.some((s) => normalizeUci(s.uci) === playedUci);

    const applied = applyMove(session.state, move);
    const solveMs = Math.max(0, Math.round(nowMs() - session.startedAtMs));

    setSession({
      ...session,
      state: applied,
      result: { correct: ok, playedUci, solveMs },
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
          success: ok,
          solveMs
        });
      } catch {
        // ignore
      }

      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const grade = await coach.gradeMove(session.baseState, move, coachConfig, ac.signal);
        if (ac.signal.aborted) return;
        setSession((prev) => (prev ? { ...prev, grade, coachBusy: false } : prev));
      } catch {
        if (ac.signal.aborted) return;
        setSession((prev) => (prev ? { ...prev, coachBusy: false } : prev));
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
      const analysis = await coach.analyze(session.baseState, session.baseState.sideToMove, coachConfig, ac.signal);
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

  return (
    <section className="stack">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tactics (single-move)</h3>
        <p className="muted">
          Solve puzzles by finding the best move. This is a first version: single-move tactics + basic coach hints.
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
              <button type="button" className="btn btn-primary" onClick={startNext} disabled={tacticRefs.length === 0}>
                Start tactic
              </button>
              {session && (
                <button type="button" className="btn btn-secondary" onClick={tryAgain} disabled={!session || !!session.result}>
                  Reset
                </button>
              )}
            </div>

            <p className="muted" style={{ marginTop: 8 }}>
              Available tactics: <strong>{tacticRefs.length}</strong>
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

          <ChessBoard
            state={session.state}
            orientation={orientation}
            selectedSquare={selectedSquare}
            legalMovesFromSelection={legalMovesFromSelection}
            hintMove={hintMove}
            lastMove={session.lastMove}
            checkSquares={checkSquares}
            onSquareClick={handleSquareClick}
            onMoveAttempt={handleMoveAttempt}
            disabled={!!session.result || session.coachBusy}
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
