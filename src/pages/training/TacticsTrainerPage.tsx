import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { GameState, Move, Square } from '../../domain/chessTypes';
import type { Orientation } from '../../domain/localSetup';
import { generateLegalMoves } from '../../domain/legalMoves';
import { getPiece } from '../../domain/board';
import { fromFEN } from '../../domain/notation/fen';

import { ChessBoard } from '../../ui/ChessBoard';
import { PromotionChooser } from '../../ui/PromotionChooser';

import { loadBuiltInPacks } from '../../domain/training/packLoader';
import type { TrainingPack, TrainingItem, TacticItem } from '../../domain/training/schema';
import { splitItemKey, type TrainingItemKey } from '../../domain/training/keys';
import { evaluateTacticMove } from '../../domain/training/tactics';

import {
  ensureDailyQueue,
  listItemStats,
  recordAttempt,
  type TrainingItemStats
} from '../../storage/training/trainingStore';

import { createStrongSearchCoach, getProgressiveHint, type CoachAnalysis, type CoachHint } from '../../domain/coach';

type Mode = 'daily' | 'pack';
type Status = 'idle' | 'loading' | 'ready' | 'error';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function todayLocalIsoDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function findItem(packs: TrainingPack[], key: string): { pack: TrainingPack; item: TrainingItem } | null {
  const parsed = splitItemKey(key);
  if (!parsed) return null;
  const pack = packs.find((p) => p.id === parsed.packId);
  if (!pack) return null;
  const item = pack.items.find((it) => it.itemId === parsed.itemId);
  if (!item) return null;
  return { pack, item };
}

function isSolvedToday(stats: TrainingItemStats | undefined, date: string): boolean {
  if (!stats) return false;
  if (stats.lastResult !== 'success') return false;
  if (typeof stats.lastSeenAtMs !== 'number') return false;
  const d = new Date(stats.lastSeenAtMs);
  return todayLocalIsoDate(d) === date;
}

function formatMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${r}s`;
}

type SessionResult = {
  key: TrainingItemKey;
  success: boolean;
  solveMs: number;
  playedUci?: string;
  gradeLabel?: string;
};

export function TacticsTrainerPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const [packs, setPacks] = useState<TrainingPack[]>([]);
  const [packErrors, setPackErrors] = useState<string[]>([]);

  const [mode, setMode] = useState<Mode>('daily');
  const [packId, setPackId] = useState<string>('basic');

  const [dailyDate, setDailyDate] = useState<string>(() => todayLocalIsoDate());
  const [dailyKeys, setDailyKeys] = useState<TrainingItemKey[]>([]);
  const [stats, setStats] = useState<Map<TrainingItemKey, TrainingItemStats>>(new Map());

  const [currentKey, setCurrentKey] = useState<TrainingItemKey | null>(null);
  const [currentPack, setCurrentPack] = useState<TrainingPack | null>(null);
  const [currentItem, setCurrentItem] = useState<TacticItem | null>(null);

  const [baseState, setBaseState] = useState<GameState | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square; options: Move[] } | null>(null);

  const startTimeRef = useRef<number>(0);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [solved, setSolved] = useState<{ solveMs: number; playedUci: string; gradeLabel?: string } | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);

  // coach / hint
  const coachRef = useRef(createStrongSearchCoach());
  const [analysis, setAnalysis] = useState<CoachAnalysis | null>(null);
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2 | 3>(0);
  const [hint, setHint] = useState<CoachHint | null>(null);

  // session summary
  const [results, setResults] = useState<SessionResult[]>([]);

  const orientation: Orientation = 'w';

  // Load packs + stats + daily queue
  useEffect(() => {
    let alive = true;
    (async () => {
      setStatus('loading');
      setError(null);
      try {
        const res = await loadBuiltInPacks();
        if (!alive) return;

        setPacks(res.packs);
        setPackErrors(res.errors.map((e) => e.message));
        const firstPack = res.packs[0]?.id ?? 'basic';
        setPackId((prev) => prev || firstPack);

        const statsList = await listItemStats();
        if (!alive) return;
        const map = new Map<TrainingItemKey, TrainingItemStats>();
        for (const s of statsList) map.set(s.key, s);
        setStats(map);

        const date = todayLocalIsoDate();
        setDailyDate(date);
        const dq = await ensureDailyQueue(res.packs, date);
        if (!alive) return;
        setDailyKeys(dq.itemKeys);
        setStatus('ready');
      } catch (e: any) {
        setStatus('error');
        setError(e?.message || String(e));
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Candidate tactic keys for the chosen mode
  const candidateKeys: TrainingItemKey[] = useMemo(() => {
    if (!packs.length) return [];
    if (mode === 'daily') {
      // daily queue may include non-tactics; filter here
      return dailyKeys.filter((k) => {
        const found = findItem(packs, k);
        return found?.item.type === 'tactic';
      });
    }

    const pack = packs.find((p) => p.id === packId);
    if (!pack) return [];
    const items = pack.items.filter((it) => it.type === 'tactic');
    return items.map((it) => `${pack.id}:${it.itemId}` as TrainingItemKey);
  }, [packs, mode, dailyKeys, packId]);

  function resetPerItemUi() {
    setSelectedSquare(null);
    setPendingPromotion(null);
    setFeedback(null);
    setSolved(null);
    setLastMove(null);
    setAnalysis(null);
    setHintLevel(0);
    setHint(null);
  }

  function loadItemByKey(key: TrainingItemKey | null) {
    if (!key) {
      setCurrentKey(null);
      setCurrentPack(null);
      setCurrentItem(null);
      setBaseState(null);
      return;
    }
    const found = findItem(packs, key);
    if (!found) {
      setFeedback(`Could not find item: ${key}`);
      setCurrentKey(null);
      setCurrentPack(null);
      setCurrentItem(null);
      setBaseState(null);
      return;
    }

    if (found.item.type !== 'tactic') {
      setFeedback(`Unsupported item type for tactics trainer: ${found.item.type}`);
      setCurrentKey(null);
      setCurrentPack(null);
      setCurrentItem(null);
      setBaseState(null);
      return;
    }

    const fen = found.item.position?.fen;
    const state = fromFEN(fen);

    setCurrentKey(key);
    setCurrentPack(found.pack);
    setCurrentItem(found.item);
    setBaseState(state);
    resetPerItemUi();

    startTimeRef.current = Date.now();
  }

  // When mode/pack changes, load the “next” item automatically.
  useEffect(() => {
    if (status !== 'ready') return;
    if (!candidateKeys.length) {
      loadItemByKey(null);
      return;
    }

    // choose first not solved today (for daily), else first in list
    let next: TrainingItemKey | null = null;
    if (mode === 'daily') {
      for (const k of candidateKeys) {
        if (!isSolvedToday(stats.get(k), dailyDate)) {
          next = k;
          break;
        }
      }
      next = next ?? candidateKeys[0] ?? null;
    } else {
      next = candidateKeys[0] ?? null;
    }

    loadItemByKey(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, packId, status, candidateKeys.join('|')]);

  const legalMoves: Move[] = useMemo(() => {
    if (!baseState) return [];
    return generateLegalMoves(baseState);
  }, [baseState]);

  const legalFromSelection: Move[] = useMemo(() => {
    if (!selectedSquare) return [];
    return legalMoves.filter((m) => m.from === selectedSquare);
  }, [legalMoves, selectedSquare]);

  const hintMove = useMemo(() => {
    if (!hint) return null;
    if (hint.kind === 'move') {
      return { from: hint.from, to: hint.to };
    }
    if (hint.kind === 'nudge') {
      if (typeof hint.from === 'number' && typeof hint.to === 'number') {
        return { from: hint.from, to: hint.to };
      }
      return null;
    }
    return null;
  }, [hint]);

  const hintText = useMemo(() => {
    if (!hint) return null;
    if (hint.kind === 'nudge') return 'Hint: look at the highlighted idea.';
    if (hint.kind === 'move') return `Hint: best move is ${hint.moveUci}.`;
    if (hint.kind === 'line') return `Hint: line: ${(hint.pv || []).join(' ')}`;
    return null;
  }, [hint]);

  function onSquareClick(square: Square) {
    if (!baseState) return;
    if (solved) return;

    const piece = getPiece(baseState.board, square);
    if (!selectedSquare) {
      if (piece && piece.color === baseState.sideToMove) setSelectedSquare(square);
      return;
    }

    if (square === selectedSquare) {
      setSelectedSquare(null);
      return;
    }

    const candidates = legalMoves.filter((m) => m.from === selectedSquare && m.to === square);
    if (candidates.length === 0) {
      // If clicking own piece, change selection.
      if (piece && piece.color === baseState.sideToMove) setSelectedSquare(square);
      return;
    }

    if (candidates.length === 1 && !candidates[0].promotion) {
      void submitMove(candidates[0]);
      return;
    }

    // promotion or multiple candidates
    setPendingPromotion({ from: selectedSquare, to: square, options: candidates });
  }

  async function submitMove(move: Move) {
    if (!baseState || !currentItem || !currentKey || !currentPack) return;

    setSelectedSquare(null);
    setPendingPromotion(null);

    const { playedUci, playedSan, isCorrect } = evaluateTacticMove(baseState, move, currentItem);
    setLastMove({ from: move.from, to: move.to });

    const solveMs = Date.now() - startTimeRef.current;

    if (!isCorrect) {
      setFeedback(`Not quite (${playedSan}). Try again.`);
      return;
    }

    // Grade against engine (best vs played)
    let gradeLabel: string | undefined = undefined;
    try {
      const signal = new AbortController().signal;
      const grade = await coachRef.current.gradeMove(baseState, move, { maxDepth: 4, thinkTimeMs: 60 }, signal);
      gradeLabel = grade.label;
    } catch {
      // grading is best-effort
    }

    setSolved({ solveMs, playedUci, gradeLabel });
    setFeedback(null);

    // Persist success
    const updated = await recordAttempt({
      packId: currentPack.id,
      itemId: currentItem.itemId,
      success: true,
      solveMs
    });

    setStats((prev) => {
      const next = new Map(prev);
      next.set(updated.key, updated);
      return next;
    });

    setResults((prev) => [
      ...prev,
      { key: currentKey, success: true, solveMs, playedUci, gradeLabel }
    ]);
  }

  async function onShowSolution() {
    if (!baseState || !currentItem || !currentKey || !currentPack) return;
    if (solved) return;

    const solveMs = Date.now() - startTimeRef.current;
    const best = currentItem.solutions?.[0]?.uci ?? '(unknown)';
    setFeedback(`Solution: ${best}`);
    setSolved({ solveMs, playedUci: best, gradeLabel: 'Missed' });

    const updated = await recordAttempt({
      packId: currentPack.id,
      itemId: currentItem.itemId,
      success: false,
      solveMs
    });

    setStats((prev) => {
      const next = new Map(prev);
      next.set(updated.key, updated);
      return next;
    });

    setResults((prev) => [...prev, { key: currentKey, success: false, solveMs, playedUci: best, gradeLabel: 'Missed' }]);
  }

  function onRetry() {
    if (!currentItem || !currentPack) return;
    const key = currentKey;
    if (!key) return;
    loadItemByKey(key);
  }

  function onNext() {
    if (!candidateKeys.length) return;
    if (!currentKey) {
      loadItemByKey(candidateKeys[0] ?? null);
      return;
    }

    const idx = candidateKeys.indexOf(currentKey);
    if (mode === 'daily') {
      for (let offset = 1; offset <= candidateKeys.length; offset++) {
        const k = candidateKeys[(idx + offset) % candidateKeys.length]!;
        if (!isSolvedToday(stats.get(k), dailyDate)) {
          loadItemByKey(k);
          return;
        }
      }
    }

    const next = candidateKeys[(idx + 1) % candidateKeys.length] ?? null;
    loadItemByKey(next);
  }

  async function onHint() {
    if (!baseState) return;
    const nextLevel = (Math.min(3, (hintLevel + 1)) as 1 | 2 | 3);
    setHintLevel(nextLevel);

    try {
      let a = analysis;
      if (!a) {
        const signal = new AbortController().signal;
        a = await coachRef.current.analyze(baseState, baseState.sideToMove, { maxDepth: 4, thinkTimeMs: 60 }, signal);
        setAnalysis(a);
      }
      const h = getProgressiveHint(a, nextLevel);
      setHint(h);
    } catch {
      setHint(null);
    }
  }

  const mistakes = useMemo(() => results.filter((r) => !r.success).map((r) => r.key), [results]);
  const solvedCount = useMemo(() => results.filter((r) => r.success).length, [results]);
  const failedCount = useMemo(() => results.filter((r) => !r.success).length, [results]);

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="stack" style={{ gap: 4 }}>
          <h2 style={{ margin: 0 }}>Tactics</h2>
          <p className="muted" style={{ margin: 0 }}>
            Single-move tactics trainer (v1).
          </p>
        </div>
        <Link className="btn btn-secondary" to="/training">
          Back
        </Link>
      </div>

      {status === 'loading' && <p className="muted">Loading…</p>}
      {status === 'error' && <p className="muted">Error: {error}</p>}

      {status === 'ready' && (
        <>
          {packErrors.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Pack warnings</h3>
              <ul>
                {packErrors.map((e, i) => (
                  <li key={i} className="muted">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3 style={{ marginTop: 0 }}>Session</h3>
              <span className="muted" style={{ fontSize: 12 }}>
                Solved {solvedCount} • Missed {failedCount}
              </span>
            </div>

            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <label className="row" style={{ gap: 6 }}>
                <span className="muted">Mode</span>
                <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                  <option value="daily">Daily</option>
                  <option value="pack">Pack</option>
                </select>
              </label>

              {mode === 'pack' && (
                <label className="row" style={{ gap: 6 }}>
                  <span className="muted">Pack</span>
                  <select value={packId} onChange={(e) => setPackId(e.target.value)}>
                    {packs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {mode === 'daily' && (
                <span className="muted" style={{ fontSize: 12 }}>
                  Queue date: {dailyDate} • Items: {candidateKeys.length}
                </span>
              )}
            </div>
          </div>

          {!currentItem || !baseState ? (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>No tactic available</h3>
              <p className="muted">No tactic items were found for this mode/pack.</p>
            </div>
          ) : (
            <div className="grid2" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1fr)', gap: 12 }}>
              <div className="card stack">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 0 }}>{currentItem.goal || 'Solve the tactic'}</h3>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {currentPack?.title ?? 'Training'} • {currentItem.itemId}
                  </span>
                </div>
                <p className="muted" style={{ marginTop: 6 }}>
                  Themes: {currentItem.themes.join(', ') || '—'} • Difficulty: {currentItem.difficulty}
                </p>

                {hintText && <p className="muted">{hintText}</p>}

                {feedback && <p className="muted">{feedback}</p>}

                {solved && (
                  <div className="card">
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <strong>Solved</strong>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {formatMs(solved.solveMs)}
                        {solved.gradeLabel ? ` • ${solved.gradeLabel}` : ''}
                      </span>
                    </div>
                    <p className="muted" style={{ marginTop: 6 }}>
                      Move: {solved.playedUci}
                    </p>
                  </div>
                )}

                <div className="actions">
                  <button className="btn btn-secondary" type="button" onClick={onHint} disabled={!!solved}>
                    Hint
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={onShowSolution} disabled={!!solved}>
                    Show solution
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={onRetry}>
                    Retry
                  </button>
                  <button className="btn btn-primary" type="button" onClick={onNext}>
                    Next
                  </button>
                </div>

                {mistakes.length > 0 && (
                  <div className="card">
                    <h4 style={{ marginTop: 0 }}>Mistakes (this session)</h4>
                    <ul>
                      {mistakes.slice(-10).map((k) => (
                        <li key={k} className="muted">
                          {k}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="card">
                <ChessBoard
                  state={baseState}
                  orientation={orientation}
                  selectedSquare={selectedSquare}
                  legalMovesFromSelection={legalFromSelection}
                  hintMove={hintMove}
                  lastMove={lastMove}
                  onSquareClick={onSquareClick}
                  onMoveAttempt={(from, to, candidates) => {
                    // The board interaction hook already calls this, but our move logic is driven by onSquareClick.
                    // Still, keep it consistent if future interactions call this directly.
                    if (!candidates || candidates.length === 0) return;
                    if (candidates.length === 1 && !candidates[0].promotion) {
                      void submitMove(candidates[0]);
                      return;
                    }
                    setPendingPromotion({ from, to, options: candidates });
                  }}
                  disabled={false}
                />

                {pendingPromotion && (
                  <div className="card" style={{ marginTop: 10 }}>
                    <PromotionChooser
                      color={baseState.sideToMove}
                      options={pendingPromotion.options}
                      onChoose={(mv) => void submitMove(mv)}
                      onCancel={() => setPendingPromotion(null)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
