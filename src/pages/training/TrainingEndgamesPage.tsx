import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import type { Color, GameState, Move, Square } from '../../domain/chessTypes';
import { applyMove } from '../../domain/applyMove';
import { generateLegalMoves } from '../../domain/legalMoves';
import { isInCheck } from '../../domain/attack';
import { tryParseFEN } from '../../domain/notation/fen';
import { moveToUci } from '../../domain/notation/uci';
import { getGameStatus } from '../../domain/gameStatus';

function findKingSquare(state: GameState, color: Color): Square | null {
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (p && p.type === 'k' && p.color === color) return i as Square;
  }
  return null;
}

import type { TrainingItemKey } from '../../domain/training/keys';
import { makeItemKey, splitItemKey } from '../../domain/training/keys';
import type { EndgameItem, TrainingPack } from '../../domain/training/schema';
import { loadBuiltInPacks } from '../../domain/training/packLoader';
import { parseEndgameGoal, checkEndgameGoal } from '../../domain/training/endgameGoals';

import { ChessBoard } from '../../ui/ChessBoard';
import { PromotionChooser } from '../../ui/PromotionChooser';

import { createStrongSearchCoach, getProgressiveHint } from '../../domain/coach';
import type { Coach, CoachAnalysis, CoachHint } from '../../domain/coach';

import type { TrainingItemStats } from '../../storage/training/trainingStore';
import { listItemStats, recordAttempt } from '../../storage/training/trainingStore';

import type { TrainingSessionRecord, TrainingMistakeRecord } from '../../storage/training/trainingSessionStore';
import { addTrainingMistake, makeSessionId, saveTrainingSession } from '../../storage/training/trainingSessionStore';

type Status = 'idle' | 'loading' | 'ready' | 'error';

type EndgameRef = {
  key: TrainingItemKey;
  packId: string;
  itemId: string;
  difficulty: number;
  fen: string;
  goalText?: string;
  themes: string[];
};

type EndgameResult = {
  success: boolean;
  message: string;
  statusKind: string;
  finishedAtMs: number;
  solveMs: number;
  sessionId?: string;
};

type EndgameSession = {
  ref: EndgameRef;
  baseState: GameState;
  state: GameState;
  playerColor: Color;
  startedAtMs: number;
  playedLineUci: string[];
  lastMove: Move | null;
  lastMoveColor: Color | null;
  pendingPromotion: { color: Color; options: Move[] } | null;

  analysis: CoachAnalysis | null;
  hint: CoachHint | null;

  result: EndgameResult | null;
};

function nowMs() {
  return Date.now();
}

function useQuery() {
  const loc = useLocation();
  return useMemo(() => new URLSearchParams(loc.search), [loc.search]);
}

function pickNextEndgame(refs: EndgameRef[], stats: TrainingItemStats[], ts: number, focusKey?: TrainingItemKey | null): EndgameRef | null {
  if (refs.length === 0) return null;
  if (focusKey) {
    const f = refs.find((r) => r.key === focusKey);
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

function statusLabel(kind: string): string {
  switch (kind) {
    case 'checkmate':
      return 'Checkmate';
    case 'stalemate':
      return 'Stalemate';
    default:
      return kind;
  }
}

export function TrainingEndgamesPage() {
  const query = useQuery();
  const focusKey = useMemo(() => {
    const raw = query.get('focus');
    if (!raw) return null;
    const parsed = splitItemKey(raw);
    return parsed ? makeItemKey(parsed.packId, parsed.itemId) : null;
  }, [query]);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [packs, setPacks] = useState<TrainingPack[]>([]);
  const [stats, setStats] = useState<TrainingItemStats[]>([]);
  const [session, setSession] = useState<EndgameSession | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  const coachRef = useRef<Coach | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!coachRef.current) coachRef.current = createStrongSearchCoach();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setStatus('loading');
      setError(null);
      try {
        const [p, s] = await Promise.all([loadBuiltInPacks(), listItemStats()]);
        if (!mounted) return;
        setPacks(p.packs);
        setStats(s);
        setStatus('ready');
      } catch (e: any) {
        if (!mounted) return;
        setError(String(e?.message ?? e));
        setStatus('error');
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
    // stable ordering
    out.sort((a, b) => (a.packId + ':' + a.itemId).localeCompare(b.packId + ':' + b.itemId));
    return out;
  }, [packs]);

  const byKeyStats = useMemo(() => {
    const m = new Map<string, TrainingItemStats>();
    for (const s of stats) m.set(s.key, s);
    return m;
  }, [stats]);

  const checkSquares = useMemo(() => {
    if (!session) return [] as Square[];
    const stm = session.state.sideToMove;
    if (!isInCheck(session.state, stm)) return [] as Square[];
    const k = findKingSquare(session.state, stm);
    return k == null ? [] : [k];
  }, [session]);

  const legalMovesFromSelection = useMemo(() => {
    if (!session || selectedSquare == null) return [] as Move[];
    return generateLegalMoves(session.state, selectedSquare);
  }, [session, selectedSquare]);

  const hintMove = useMemo(() => {
    if (!session?.hint) return null;
    if (session.hint.kind === 'nudge' || session.hint.kind === 'move') {
      if (session.hint.from != null && session.hint.to != null) return { from: session.hint.from, to: session.hint.to };
    }
    return null;
  }, [session?.hint]);

  function clearCoaching() {
    abortRef.current?.abort();
    abortRef.current = null;
    if (!session) return;
    setSession({ ...session, analysis: null, hint: null });
  }

  async function startEndgame(ref?: EndgameRef | null) {
    const ts = nowMs();
    const chosen = ref ?? pickNextEndgame(endgameRefs, stats, ts, focusKey);
    if (!chosen) return;

    const parsed = tryParseFEN(chosen.fen);
    if (!parsed.ok) {
      setError(`Invalid FEN for ${chosen.packId}:${chosen.itemId}: ${parsed.error}`);
      setStatus('error');
      return;
    }

    setSelectedSquare(null);
    abortRef.current?.abort();
    abortRef.current = null;

    const base = parsed.value;
    const playerColor = base.sideToMove;
    const goal = parseEndgameGoal(chosen.goalText);

    const s: EndgameSession = {
      ref: chosen,
      baseState: base,
      state: base,
      playerColor,
      startedAtMs: ts,
      playedLineUci: [],
      lastMove: null,
      lastMoveColor: null,
      pendingPromotion: null,
      analysis: null,
      hint: null,
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
  }

  function handleSquareClick(square: Square) {
    if (!session) return;
    if (session.result) return;
    if (session.pendingPromotion) return;

    // Selecting a piece
    const legalFrom = generateLegalMoves(session.state, square);
    if (legalFrom.length > 0) {
      setSelectedSquare(square);
      return;
    }

    // Attempt a move by clicking destination while having a selection
    if (selectedSquare != null && selectedSquare !== square) {
      const candidates = generateLegalMoves(session.state, selectedSquare).filter((m) => m.to === square);
      if (candidates.length === 0) return;
      tryApplyCandidates(selectedSquare, square, candidates);
    }
  }

  function tryApplyCandidates(from: Square, to: Square, candidates: Move[]) {
    if (!session) return;
    if (session.result) return;

    if (candidates.length > 1) {
      // Promotion: show chooser.
      setSession({
        ...session,
        pendingPromotion: { color: session.state.sideToMove, options: candidates }
      });
      return;
    }

    const mv = candidates[0];
    applyAndAdvance(mv);
  }

  function handleMoveAttempt(from: Square, to: Square, candidates: Move[]) {
    if (!session) return;
    if (session.result) return;
    if (session.pendingPromotion) return;

    if (candidates.length === 0) return;
    tryApplyCandidates(from, to, candidates);
  }

  async function applyAndAdvance(move: Move) {
    if (!session) return;
    clearCoaching();

    const moverColor = session.state.sideToMove;
    let next = applyMove(session.state, move);

    const played = session.playedLineUci.concat([moveToUci(move)]);
    let lastMove = move;
    let lastMoveColor: Color = moverColor;

    // If it's now opponent's turn, let opponent play (simple engine reply) until it's player's turn again or game ends.
    while (getGameStatus(next).kind === 'inProgress' && next.sideToMove !== session.playerColor) {
      const coach = coachRef.current;
      if (!coach) break;
      // Use coach analysis to pick a move for opponent; small depth for responsiveness.
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

    const goal = parseEndgameGoal(session.ref.goalText);
    const check = checkEndgameGoal(next, session.playerColor, goal, lastMove, lastMoveColor);

    const updated: EndgameSession = {
      ...session,
      state: next,
      playedLineUci: played,
      lastMove,
      lastMoveColor,
      pendingPromotion: null
    };

    if (check.done) {
      const ts = nowMs();
      const solveMs = Math.max(0, ts - session.startedAtMs);

      // Persist item attempt
      await recordAttempt({
        packId: session.ref.packId,
        itemId: session.ref.itemId,
        success: check.success,
        solveMs,
        nowMs: ts
      });

      // Save as a small "session" for reuse of the summary page.
      const sessionId = makeSessionId();
      const rec: TrainingSessionRecord = {
        id: sessionId,
        mode: 'endgames',
        startedAtMs: session.startedAtMs,
        endedAtMs: ts,
        attempted: 1,
        correct: check.success ? 1 : 0,
        totalSolveMs: solveMs,
        avgSolveMs: solveMs,
        totalCpLoss: 0,
        avgCpLoss: 0,
        gradeCounts: {},
        packIds: [session.ref.packId]
      };
      await saveTrainingSession(rec);

      if (!check.success) {
        const mistake: TrainingMistakeRecord = {
          id: makeSessionId(),
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
        // Store a sensible fen (from the ref if possible)
        mistake.fen = session.ref.fen;
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

      // Refresh stats list for header accuracies etc.
      setStats(await listItemStats());
    }

    setSelectedSquare(null);
    setSession(updated);
  }

  async function showHint(level: 1 | 2 | 3) {
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
      setError(String(e?.message ?? e));
    }
  }

  async function giveUp() {
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
    const rec: TrainingSessionRecord = {
      id: sessionId,
      mode: 'endgames',
      startedAtMs: session.startedAtMs,
      endedAtMs: ts,
      attempted: 1,
      correct: 0,
      totalSolveMs: solveMs,
      avgSolveMs: solveMs,
      totalCpLoss: 0,
      avgCpLoss: 0,
      gradeCounts: {},
      packIds: [session.ref.packId]
    };
    await saveTrainingSession(rec);

    const mistake: TrainingMistakeRecord = {
      id: makeSessionId(),
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
  }

  if (status === 'loading' || status === 'idle') {
    return (
      <section className="stack">
        <p className="muted">Loading endgames…</p>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className="stack">
        <h3 style={{ marginTop: 0 }}>Endgames</h3>
        <p className="muted">Failed to load endgames: {error}</p>
        <div className="actions">
          <Link className="btn btn-secondary" to="/training">Back</Link>
        </div>
      </section>
    );
  }

  const showList = !session;

  if (showList) {
    return (
      <section className="stack">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Endgames</h3>
          <p className="muted">Goal-based endgame practice. Select an endgame or start one automatically.</p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => startEndgame(null)} disabled={endgameRefs.length === 0}>
              Start endgame
            </button>
          </div>
        </div>

        {endgameRefs.length === 0 ? (
          <p className="muted">No endgame items found in built-in packs.</p>
        ) : (
          <div className="stack">
            {endgameRefs.map((r) => {
              const st = byKeyStats.get(r.key);
              const acc = st && st.attempts > 0 ? Math.round((st.successes / st.attempts) * 100) : null;
              return (
                <div key={r.key} className="card">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div>
                      <strong>{r.packId}</strong> · <span className="muted">{r.itemId}</span>
                    </div>
                    <span className="muted" style={{ fontSize: 12 }}>
                      diff {r.difficulty}{acc != null ? ` • ${acc}%` : ''}
                    </span>
                  </div>
                  <p className="muted" style={{ marginTop: 8 }}>
                    Goal: <strong>{r.goalText ?? 'Win'}</strong>
                  </p>
                  <p className="muted" style={{ marginTop: 6 }}>
                    Themes: {r.themes.join(', ')}
                  </p>
                  <div className="actions" style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => startEndgame(r)}>
                      Start
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  // Session view
  const orientation = session.playerColor;
  const goal = parseEndgameGoal(session.ref.goalText);

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ marginTop: 0 }}>Endgame</h3>
        <button type="button" className="btn btn-secondary" onClick={() => setSession(null)}>
          Back to list
        </button>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <strong>{session.ref.packId}</strong> · <span className="muted">{session.ref.itemId}</span>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>Goal: {goal.text ?? goal.kind}</span>
        </div>

        {session.result ? (
          <div style={{ marginTop: 10 }}>
            <p className={session.result.success ? '' : 'muted'} style={{ marginTop: 0 }}>
              <strong>{session.result.success ? 'Success' : 'Failed'}</strong> — {session.result.message}{' '}
              <span className="muted">({statusLabel(session.result.statusKind)})</span>
            </p>
            <p className="muted" style={{ marginTop: 6 }}>
              Time: {Math.round(session.result.solveMs / 1000)}s
            </p>
            <div className="actions" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-primary" onClick={() => startEndgame(null)}>
                Next endgame
              </button>
              {session.result.sessionId && (
                <Link className="btn btn-secondary" to={`/training/session/${encodeURIComponent(session.result.sessionId)}`}>
                  Session summary
                </Link>
              )}
            </div>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 8 }}>
            {goal.kind === 'draw' ? 'Try to force a draw.' : goal.kind === 'promote' ? 'Try to promote a pawn.' : 'Try to win the position.'}
          </p>
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
          disabled={!!session.result}
        />

        {session.pendingPromotion && (
          <PromotionChooser
            color={session.pendingPromotion.color}
            options={session.pendingPromotion.options}
            onChoose={(mv) => applyAndAdvance(mv)}
            onCancel={() => setSession({ ...session, pendingPromotion: null })}
          />
        )}

        {!session.result && (
          <div className="actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={() => showHint(1)}>
              Hint 1
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => showHint(2)}>
              Hint 2
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => showHint(3)}>
              Hint 3
            </button>
            <button type="button" className="btn btn-secondary" onClick={giveUp}>
              Give up
            </button>
          </div>
        )}

        {session.analysis && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>Coach</strong>
              <button type="button" className="btn btn-secondary" onClick={clearCoaching}>
                Clear
              </button>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              Eval: <strong>{session.analysis.scoreCp ?? 0}</strong> cp · Best: <code>{session.analysis.bestMoveUci ?? '—'}</code>
            </p>
            {session.analysis.pv && session.analysis.pv.length > 0 && (
              <p className="muted" style={{ marginTop: 6 }}>
                PV: <code>{session.analysis.pv.join(' ')}</code>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
