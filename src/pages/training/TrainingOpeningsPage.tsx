import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useGlobalHotkeys } from '../../ui/useGlobalHotkeys';
import { useTrainingSettings } from './TrainingSettingsContext';

import type { Color, GameState, Move, Square } from '../../domain/chessTypes';
import { generateLegalMoves } from '../../domain/legalMoves';
import { applyMove } from '../../domain/applyMove';
import { tryParseFEN } from '../../domain/notation/fen';
import { moveToUci } from '../../domain/notation/uci';

import { loadAllPacks } from '../../domain/training/packLoader';
import type { OpeningLineItem, TrainingPack } from '../../domain/training/schema';
import { parseItemKey, type TrainingItemKey } from '../../domain/training/keys';
import { isUciLike, normalizeUci, uciToLegalMove, autoPlayOpponentReplies } from '../../domain/training/openingsDrill';
import { buildOpeningNodes, pickNextOpeningNode, type OpeningNodeRef } from '../../domain/training/openingNodes';

import { ChessBoard } from '../../ui/ChessBoard';
import type { Orientation } from '../../domain/localSetup';

import { listItemStats, recordAttempt, type TrainingItemStats } from '../../storage/training/trainingStore';
import { listOpeningNodeStats, recordOpeningNodeAttempt, type OpeningNodeStats } from '../../storage/training/openingNodeStore';

type Status = 'idle' | 'loading' | 'ready' | 'error';

type DrillMode = 'nodes' | 'line';

type OpeningRef = {
  key: TrainingItemKey;
  packId: string;
  packTitle: string;
  item: OpeningLineItem;
  lineUci: string[];
};

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function pickNextOpening(refs: OpeningRef[], stats: TrainingItemStats[], ts: number, focusKey?: TrainingItemKey | null): OpeningRef | null {
  if (refs.length === 0) return null;

  if (focusKey) {
    const f = refs.find((r) => r.key === focusKey);
    if (f) return f;
  }

  const byKey = new Map<string, TrainingItemStats>();
  for (const s of stats) byKey.set(s.key, s);

  const due: OpeningRef[] = [];
  const fresh: OpeningRef[] = [];
  const seen: OpeningRef[] = [];

  for (const r of refs) {
    const s = byKey.get(r.key);
    if (!s || (s.attempts || 0) === 0) fresh.push(r);
    else if ((s.nextDueAtMs || 0) <= ts) due.push(r);
    else seen.push(r);
  }

  // deterministic ordering
  const byKeyAsc = (a: OpeningRef, b: OpeningRef) => a.key.localeCompare(b.key);
  due.sort(byKeyAsc);
  fresh.sort(byKeyAsc);
  seen.sort((a, b) => {
    const sa = byKey.get(a.key)?.lastSeenAtMs || 0;
    const sb = byKey.get(b.key)?.lastSeenAtMs || 0;
    if (sa !== sb) return sa - sb; // least recently seen first
    return a.key.localeCompare(b.key);
  });

  return due[0] ?? fresh[0] ?? seen[0] ?? null;
}

function buildOpeningRefs(packs: TrainingPack[]): { refs: OpeningRef[]; warnings: string[] } {
  const refs: OpeningRef[] = [];
  const warnings: string[] = [];

  for (const p of packs) {
    for (const it of p.items) {
      if (it.type !== 'openingLine') continue;
      const item = it as OpeningLineItem;

      // v1: item.line is intended to be UCI (SAN could be supported later)
      const rawMoves = item.line ?? [];
      const lineUci: string[] = [];
      const bad: string[] = [];

      for (const m of rawMoves) {
        if (isUciLike(m)) lineUci.push(normalizeUci(m));
        else bad.push(String(m));
      }

      if (lineUci.length === 0) {
        warnings.push(`Opening line ${p.id}:${item.itemId} has no UCI moves (line is empty or contains non-UCI moves).`);
        continue;
      }
      if (bad.length > 0) {
        warnings.push(`Opening line ${p.id}:${item.itemId} ignored non-UCI moves: ${bad.join(', ')}`);
      }

      refs.push({
        key: `${p.id}:${item.itemId}`,
        packId: p.id,
        packTitle: p.title,
        item,
        lineUci
      });
    }
  }

  refs.sort((a, b) => a.key.localeCompare(b.key));
  return { refs, warnings };
}

export function TrainingOpeningsPage() {

  const { settings } = useTrainingSettings();
  const showHintSquares = settings.hintStyle === 'squares' || settings.hintStyle === 'both';
  const showHintArrow = settings.hintStyle === 'arrow' || settings.hintStyle === 'both';

  const query = useQuery();
  const focusParam = query.get('focus');
  const focusKey = focusParam ? parseItemKey(focusParam) : null;
  const focusNodeParam = query.get('focusNode');
  const focusNodeKey = focusNodeParam ? String(focusNodeParam) : null;

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [refs, setRefs] = useState<OpeningRef[]>([]);
  const [stats, setStats] = useState<TrainingItemStats[]>([]);
  const [nodeStats, setNodeStats] = useState<OpeningNodeStats[]>([]);

  const [drillColor, setDrillColor] = useState<Color>('w');

  const [mode, setMode] = useState<DrillMode>('nodes');

  const [current, setCurrent] = useState<OpeningRef | null>(null);
  const [currentNode, setCurrentNode] = useState<OpeningNodeRef | null>(null);
  const [initialFen, setInitialFen] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [index, setIndex] = useState<number>(0);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  const [running, setRunning] = useState<boolean>(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [showHint, setShowHint] = useState<boolean>(false);

  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setError(null);

    Promise.all([loadAllPacks(), listItemStats(), listOpeningNodeStats()])
      .then(([packsRes, statsRes, nodeStatsRes]) => {
        if (!alive) return;

        const br = buildOpeningRefs(packsRes.packs);
        setRefs(br.refs);
        setWarnings(br.warnings);
        setStats(statsRes);
        setNodeStats(nodeStatsRes);

        setStatus('ready');
      })
      .catch((e) => {
        if (!alive) return;
        setError((e as Error).message);
        setStatus('error');
      });

    return () => {
      alive = false;
    };
  }, []);

  const orientation: Orientation = drillColor;

  const openingNodes = useMemo(() => {
    if (refs.length === 0) return { nodes: [] as OpeningNodeRef[], warnings: [] as string[] };

    const nodes: OpeningNodeRef[] = [];
    const warns: string[] = [];

    for (const r of refs) {
      const res = buildOpeningNodes({
        packId: r.packId,
        packTitle: r.packTitle,
        itemId: r.item.itemId,
        name: r.item.name ?? r.item.itemId,
        startFen: r.item.position.fen,
        lineUci: r.lineUci,
        userColor: drillColor
      });
      nodes.push(...res.nodes);
      warns.push(...res.warnings);
    }

    nodes.sort((a, b) => a.key.localeCompare(b.key));
    return { nodes, warnings: warns };
  }, [refs, drillColor]);

  const legalMovesFromSelection = useMemo(() => {
    if (!state || selectedSquare === null) return [];
    return generateLegalMoves(state, selectedSquare);
  }, [state, selectedSquare]);

  const expectedUci = useMemo(() => {
    if (mode === 'nodes') return currentNode?.expectedUci ?? null;
    if (!current) return null;
    return current.lineUci[index] ?? null;
  }, [mode, currentNode, current, index]);

  const expectedMove = useMemo(() => {
    if (!state || !expectedUci) return null;
    if (state.sideToMove !== drillColor) return null;
    return uciToLegalMove(state, expectedUci);
  }, [state, expectedUci, drillColor]);

  const hintMove = useMemo(() => {
    if (!showHint || !expectedMove) return null;
    return { from: expectedMove.from, to: expectedMove.to };
  }, [showHint, expectedMove]);

  function resetToInitial() {
    if (mode === 'nodes') {
      if (!currentNode) return;
      const fen = currentNode.fen;
      const parsed = tryParseFEN(fen);
      if (!parsed.ok) {
        setResultMsg(`Invalid FEN: ${parsed.error}`);
        setState(null);
        return;
      }

      setInitialFen(fen);
      setState(parsed.value);
      setIndex(currentNode.plyIndex);
      setSelectedSquare(null);
      setShowHint(false);
      setResultMsg(null);
      setRunning(true);
      startedAtRef.current = Date.now();
      return;
    }

    if (!current) return;
    const fen = current.item.position.fen;
    const parsed = tryParseFEN(fen);
    if (!parsed.ok) {
      setResultMsg(`Invalid FEN: ${parsed.error}`);
      setState(null);
      return;
    }

    setInitialFen(fen);
    setState(parsed.value);
    setIndex(0);
    setSelectedSquare(null);
    setShowHint(false);
    setResultMsg(null);
    setRunning(true);
    startedAtRef.current = Date.now();

    // If the line starts with opponent to move (because user drills as black, for example),
    // auto-play until it's the user's turn.
    const auto = autoPlayOpponentReplies(parsed.value, current.lineUci, 0, drillColor);
    if (auto.error) {
      setState(auto.state);
      setIndex(auto.nextIndex);
      setResultMsg(auto.error);
      setRunning(false);
      return;
    }
    setState(auto.state);
    setIndex(auto.nextIndex);
  }

  async function finishAttempt(success: boolean, message: string) {
    setRunning(false);
    setShowHint(false);
    setResultMsg(message);

    if (current) {
      const solveMs = Math.max(0, Date.now() - (startedAtRef.current || Date.now()));
      const nextStats = await recordAttempt({
        packId: current.packId,
        itemId: current.item.itemId,
        success,
        solveMs
      });
      // Update local stats copy (simple merge)
      setStats((prev) => {
        const out = prev.filter((s) => s.key !== nextStats.key);
        out.push(nextStats);
        out.sort((a, b) => a.key.localeCompare(b.key));
        return out;
      });
    }
  }

  async function finishNodeAttempt(success: boolean, message: string) {
    setRunning(false);
    setShowHint(false);
    setResultMsg(message);

    if (!currentNode) return;
    const solveMs = Math.max(0, Date.now() - (startedAtRef.current || Date.now()));
    const nextStats = await recordOpeningNodeAttempt({
      key: currentNode.key,
      packId: currentNode.packId,
      itemId: currentNode.itemId,
      plyIndex: currentNode.plyIndex,
      success,
      solveMs
    });

    setNodeStats((prev) => {
      const out = prev.filter((s) => s.key !== nextStats.key);
      out.push(nextStats);
      out.sort((a, b) => a.key.localeCompare(b.key));
      return out;
    });
  }

  function startNode(chosenNode: OpeningNodeRef) {
    setCurrentNode(chosenNode);
    setCurrent(null);
    setResultMsg(null);

    const parsed = tryParseFEN(chosenNode.fen);
    if (!parsed.ok) {
      setResultMsg(`Invalid FEN: ${parsed.error}`);
      setState(null);
      setRunning(false);
      return;
    }

    setInitialFen(chosenNode.fen);
    setState(parsed.value);
    setIndex(chosenNode.plyIndex);
    setSelectedSquare(null);
    setShowHint(false);
    setRunning(true);
    startedAtRef.current = Date.now();
  }

  function start(ref?: OpeningRef | null) {
    if (mode === 'nodes') {
      const ts = Date.now();
      let candidates = openingNodes.nodes;

      // If a line was explicitly chosen, drill nodes within that line.
      if (ref) {
        candidates = openingNodes.nodes.filter((n) => n.packId === ref.packId && n.itemId === ref.item.itemId);
      }

      const chosenNode = pickNextOpeningNode(candidates, nodeStats, ts, focusNodeKey);

      if (!chosenNode) {
        setResultMsg('No opening nodes found (no UCI opening lines in packs).');
        return;
      }

      startNode(chosenNode);
      return;
    }

    const ts = Date.now();
    const chosen = ref ?? pickNextOpening(refs, stats, ts, focusKey);
    if (!chosen) {
      setResultMsg('No opening lines found in packs.');
      return;
    }
    setCurrent(chosen);
    setCurrentNode(null);
    setResultMsg(null);

    // Default drill color:
    // - If focus provided, keep existing choice.
    // - Otherwise pick based on first move side-to-move from FEN: user drills the side to move by default.
    const fen = chosen.item.position.fen;
    const parsed = tryParseFEN(fen);
    if (parsed.ok) {
      setDrillColor(parsed.value.sideToMove);
    }

    // Reset will apply auto-play based on drillColor, but drillColor state updates are async.
    // So compute an immediate drillColor for this start call:
    const effectiveDrillColor: Color = parsed.ok ? parsed.value.sideToMove : drillColor;
    const fen2 = chosen.item.position.fen;
    const parsed2 = tryParseFEN(fen2);
    if (!parsed2.ok) {
      setResultMsg(`Invalid FEN: ${parsed2.error}`);
      setState(null);
      setRunning(false);
      return;
    }

    setInitialFen(fen2);
    let s = parsed2.value;
    let i = 0;

    startedAtRef.current = Date.now();
    setRunning(true);
    setShowHint(false);
    setSelectedSquare(null);

    const auto = autoPlayOpponentReplies(s, chosen.lineUci, 0, effectiveDrillColor);
    if (auto.error) {
      setState(auto.state);
      setIndex(auto.nextIndex);
      setResultMsg(auto.error);
      setRunning(false);
      return;
    }
    s = auto.state;
    i = auto.nextIndex;

    setState(s);
    setIndex(i);
    setDrillColor(effectiveDrillColor);
  }

  function onSquareClick(sq: Square) {
    if (!running) return;
    if (!state) return;
    if (state.sideToMove !== drillColor) return;

    setSelectedSquare((prev) => (prev === sq ? null : sq));
  }

  function onMoveAttempt(from: Square, to: Square, candidates: Move[]) {
    if (!running || !state || !current) return;
    if (state.sideToMove !== drillColor) return;

    if (candidates.length === 0) {
      setResultMsg('Illegal move');
      setSelectedSquare(from);
      return;
    }

    const expected = expectedUci;
    if (!expected) {
      void finishAttempt(true, 'Line complete.');
      return;
    }

    // Pick the candidate that matches the expected UCI (important for promotions).
    const expectedNorm = normalizeUci(expected);
    const chosenMove =
      candidates.find((m) => normalizeUci(moveToUci(m)) === expectedNorm) ?? candidates[0];

    const played = normalizeUci(moveToUci(chosenMove));
    if (played !== expectedNorm) {
      void finishAttempt(false, `Incorrect. Expected ${expected}. You played ${played}.`);
      return;
    }

    let nextState = applyMove(state, chosenMove);
    let nextIndex = index + 1;

    // Auto-play opponent replies if the line expects them.
    const auto = autoPlayOpponentReplies(nextState, current.lineUci, nextIndex, drillColor);
    if (auto.error) {
      setState(auto.state);
      setIndex(auto.nextIndex);
      void finishAttempt(false, auto.error);
      return;
    }
    nextState = auto.state;
    nextIndex = auto.nextIndex;

    setState(nextState);
    setIndex(nextIndex);
    setSelectedSquare(null);
    setShowHint(false);

    if (nextIndex >= current.lineUci.length) {
      void finishAttempt(true, 'Nice! Line completed.');
    }
  }

  function onMoveAttemptNode(from: Square, to: Square, candidates: Move[]) {
    if (!running || !state || !currentNode) return;
    if (state.sideToMove !== drillColor) return;

    if (candidates.length === 0) {
      setResultMsg('Illegal move');
      setSelectedSquare(from);
      return;
    }

    const expected = expectedUci;
    if (!expected) {
      void finishNodeAttempt(true, 'Done.');
      return;
    }

    const expectedNorm = normalizeUci(expected);
    const chosenMove = candidates.find((m) => normalizeUci(moveToUci(m)) === expectedNorm) ?? candidates[0];
    const played = normalizeUci(moveToUci(chosenMove));

    if (played !== expectedNorm) {
      void finishNodeAttempt(false, `Incorrect. Expected ${expectedNorm}. You played ${played}.`);
      return;
    }

    let nextState = applyMove(state, chosenMove);
    const nextIndex = currentNode.plyIndex + 1;

    // Auto-play opponent replies for preview (until it's your turn again).
    const auto = autoPlayOpponentReplies(nextState, currentNode.lineUci, nextIndex, drillColor);
    if (auto.error) {
      setState(auto.state);
      void finishNodeAttempt(false, auto.error);
      return;
    }
    nextState = auto.state;

    setState(nextState);
    setSelectedSquare(null);
    setShowHint(false);
    void finishNodeAttempt(true, 'Correct!');
  }

  const statsForCurrent = useMemo(() => {
    if (!current) return null;
    return stats.find((s) => s.key === current.key) ?? null;
  }, [stats, current]);

  const statsForCurrentNode = useMemo(() => {
    if (!currentNode) return null;
    return nodeStats.find((s) => s.key === currentNode.key) ?? null;
  }, [nodeStats, currentNode]);

  
  useGlobalHotkeys(
    [
      { key: 'h', onKey: () => setShowHint((v) => !v) },
      { key: 'n', onKey: () => void start(null) },
      { key: 'r', onKey: () => resetToInitial() },
      { key: 's', onKey: () => setShowHint(true) }
    ],
    // Keep deps limited to values that can change, to avoid re-registering hotkeys too often.
    // (drillMode was removed during refactors; only track actual state that influences handlers.)
    [running, current, drillColor, start, resetToInitial]
  );

return (
    <section className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h2 style={{ margin: 0 }}>Openings</h2>
          <div className="muted" style={{ marginTop: 6 }}>
            Repertoire drill (v2). Node-based spaced repetition (decision points) + optional full-line drill.
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn btn-secondary" to="/training">Back</Link>
        </div>
      </div>

      {status === 'loading' && <p className="muted">Loading packs…</p>}
      {status === 'error' && <p className="muted">Error: {error ?? 'Unknown error'}</p>}

      {status === 'ready' && warnings.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pack warnings</h3>
          <ul>
            {warnings.map((w, i) => (
              <li key={i} className="muted">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {status === 'ready' && openingNodes.warnings.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Line validation warnings</h3>
          <ul>
            {openingNodes.warnings.slice(0, 10).map((w, i) => (
              <li key={i} className="muted">{w}</li>
            ))}
          </ul>
          {openingNodes.warnings.length > 10 && (
            <div className="muted" style={{ fontSize: 12 }}>…and {openingNodes.warnings.length - 10} more</div>
          )}
        </div>
      )}

      {status === 'ready' && refs.length === 0 && (
        <div className="card">
          <p className="muted">
            No opening lines found in packs. Add items of type <code>openingLine</code> in a pack JSON.
          </p>
        </div>
      )}

      {status === 'ready' && refs.length > 0 && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Drill settings</strong>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Drill color controls orientation + whose moves you must play.
              </div>
            </div>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <label className="muted" style={{ fontSize: 12 }}>Mode:</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as DrillMode)}>
                <option value="nodes">Nodes (spaced repetition)</option>
                <option value="line">Full line (classic)</option>
              </select>
              <label className="muted" style={{ fontSize: 12 }}>Drill as:</label>
              <select
                value={drillColor}
                onChange={(e) => setDrillColor(e.target.value as Color)}
              >
                <option value="w">White</option>
                <option value="b">Black</option>
              </select>
              <button className="btn btn-primary" type="button" onClick={() => start(null)}>
                Start drill
              </button>
            </div>
          </div>

          {mode === 'nodes' && (
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Nodes available for this color: {openingNodes.nodes.length} • Learned: {nodeStats.filter((s) => (s.attempts || 0) > 0).length}
            </div>
          )}
        </div>
      )}

      {mode === 'nodes' && currentNode && state && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 4 }}>
                {currentNode.packTitle} • {currentNode.name}
              </h3>
              <div className="muted" style={{ fontSize: 12 }}>
                Node: {currentNode.key} • Expected: {currentNode.expectedUci}
              </div>
              {statsForCurrentNode && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Attempts: {statsForCurrentNode.attempts} • Successes: {statsForCurrentNode.successes} • Next due:{' '}
                  {statsForCurrentNode.nextDueAtMs ? new Date(statsForCurrentNode.nextDueAtMs).toLocaleDateString() : '—'}
                </div>
              )}
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-secondary" type="button" onClick={() => setShowHint((v) => !v)} disabled={!running || state.sideToMove !== drillColor}>
                {showHint ? 'Hide hint' : 'Hint'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={resetToInitial}>
                Reset
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setCurrentNode(null)}>
                Stop
              </button>
            </div>
          </div>

          {resultMsg && (
            <div className="card" style={{ marginTop: 10 }}>
              <strong>Result</strong>
              <div className="muted" style={{ marginTop: 6 }}>{resultMsg}</div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" type="button" onClick={() => start(null)}>Next node</button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    if (currentNode) startNode(currentNode);
                  }}
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <ChessBoard
              state={state}
              orientation={orientation}
              selectedSquare={selectedSquare}
              legalMovesFromSelection={legalMovesFromSelection}
              hintMove={hintMove}
              showHintSquares={showHintSquares}
              showHintArrow={showHintArrow}
              onSquareClick={onSquareClick}
              onMoveAttempt={onMoveAttemptNode}
              disabled={!running || state.sideToMove !== drillColor}
            />
          </div>

          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            Start FEN: {initialFen ?? '—'}
          </div>
        </div>
      )}

      {mode === 'line' && current && state && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 4 }}>
                {current.packTitle} • {current.item.name ?? current.item.itemId}
              </h3>
              <div className="muted" style={{ fontSize: 12 }}>
                Key: {current.key} • Moves: {current.lineUci.length} • Next: {expectedUci ?? '—'}
              </div>
              {statsForCurrent && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Attempts: {statsForCurrent.attempts} • Successes: {statsForCurrent.successes} • Accuracy:{' '}
                  {statsForCurrent.attempts > 0 ? Math.round((statsForCurrent.successes / statsForCurrent.attempts) * 100) : 0}%
                </div>
              )}
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-secondary" type="button" onClick={() => setShowHint((v) => !v)} disabled={!running || state.sideToMove !== drillColor}>
                {showHint ? 'Hide hint' : 'Hint'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={resetToInitial}>
                Reset
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setCurrent(null)}>
                Stop
              </button>
            </div>
          </div>

          {resultMsg && (
            <div className="card" style={{ marginTop: 10 }}>
              <strong>Result</strong>
              <div className="muted" style={{ marginTop: 6 }}>{resultMsg}</div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" type="button" onClick={() => start(current)}>Try again</button>
                <button className="btn btn-secondary" type="button" onClick={() => start(null)}>Next</button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <ChessBoard
              state={state}
              orientation={orientation}
              selectedSquare={selectedSquare}
              legalMovesFromSelection={legalMovesFromSelection}
              hintMove={hintMove}
              showHintSquares={showHintSquares}
              showHintArrow={showHintArrow}
              onSquareClick={onSquareClick}
              onMoveAttempt={onMoveAttempt}
              disabled={!running || state.sideToMove !== drillColor}
            />
          </div>

          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            Progress: {Math.min(index, current.lineUci.length)}/{current.lineUci.length}{' '}
            {initialFen ? `• Start FEN: ${initialFen}` : ''}
          </div>
        </div>
      )}

      {status === 'ready' && refs.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Available opening lines</h3>
          <ol>
            {refs.map((r) => (
              <li key={r.key} style={{ marginBottom: 10 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <strong>{r.packTitle} • {r.item.name ?? r.item.itemId}</strong>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      themes: {r.item.themes.join(', ') || '—'} • difficulty: {r.item.difficulty} • moves: {r.lineUci.length}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-secondary" type="button" onClick={() => start(r)}>
                      Start
                    </button>
                    <Link className="btn btn-secondary" to={`/training/openings?focus=${encodeURIComponent(r.key)}`}>Focus</Link>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}