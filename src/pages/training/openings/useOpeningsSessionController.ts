import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useGlobalHotkeys } from '../../../ui/useGlobalHotkeys';
import { useToastNotice } from '../../game/useToastNotice';
import { useMoveInput, type PendingPromotion } from '../../../ui/chessboard/useMoveInput';

import type { Color, GameState, Move, Square } from '../../../domain/chessTypes';
import type { Orientation } from '../../../domain/localSetup';
import { applyMove } from '../../../domain/applyMove';
import { createInitialGameState } from '../../../domain/gameState';
import { tryParseFEN } from '../../../domain/notation/fen';
import { moveToUci } from '../../../domain/notation/uci';

import { loadAllPacks } from '../../../domain/training/packLoader';
import type { OpeningLineItem, TrainingPack } from '../../../domain/training/schema';
import { parseItemKey, type TrainingItemKey } from '../../../domain/training/keys';
import {
  autoPlayOpponentReplies,
  isUciLike,
  normalizeUci,
  uciToLegalMove
} from '../../../domain/training/openingsDrill';
import { buildOpeningNodes, pickNextOpeningNode, type OpeningNodeRef } from '../../../domain/training/openingNodes';

import { listItemStats, recordAttempt, type TrainingItemStats } from '../../../storage/training/trainingStore';
import { listOpeningNodeStats, recordOpeningNodeAttempt, type OpeningNodeStats } from '../../../storage/training/openingNodeStore';

export type Status = 'idle' | 'loading' | 'ready' | 'error';
export type DrillMode = 'nodes' | 'line';

export type OpeningRef = {
  key: TrainingItemKey;
  packId: string;
  packTitle: string;
  item: OpeningLineItem;
  lineUci: string[];
};

function pickNextOpening(
  refs: OpeningRef[],
  stats: TrainingItemStats[],
  ts: number,
  focusKey?: TrainingItemKey | null
): OpeningRef | null {
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

export type UseOpeningsSessionControllerArgs = {
  focusKey?: string | null;
  focusNodeKey?: string | null;
};

export type UseOpeningsSessionControllerResult = {
  status: Status;
  error: string | null;
  packWarnings: string[];

  refs: OpeningRef[];
  stats: TrainingItemStats[];
  byKeyStats: Map<string, TrainingItemStats>;

  openingNodes: OpeningNodeRef[];
  openingNodesWarnings: string[];
  nodeStats: OpeningNodeStats[];
  byKeyNodeStats: Map<string, OpeningNodeStats>;
  learnedNodeCount: number;

  drillColor: Color;
  setDrillColor: (c: Color) => void;

  mode: DrillMode;
  setMode: (m: DrillMode) => void;

  orientation: Orientation;

  running: boolean;
  resultMsg: string | null;
  noticeText: string | null;
  showHintFlag: boolean;

  state: GameState | null;
  initialFen: string | null;
  index: number;

  current: OpeningRef | null;
  currentNode: OpeningNodeRef | null;

  expectedUci: string | null;
  hintMove: { from: Square; to: Square } | null;

  pendingPromotion: PendingPromotion | null;
  moveInput: ReturnType<typeof useMoveInput>;

  startDrill: (ref?: OpeningRef | null) => void;
  startNode: (node: OpeningNodeRef) => void;
  resetToInitial: () => void;

  stopSession: () => void;
  backToList: () => void;

  toggleHint: () => void;
  showHint: () => void;
};

export function useOpeningsSessionController(args: UseOpeningsSessionControllerArgs): UseOpeningsSessionControllerResult {
  const { focusKey: focusKeyRaw, focusNodeKey } = args;

  const focusKey = useMemo(() => (focusKeyRaw ? parseItemKey(focusKeyRaw) : null), [focusKeyRaw]);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [packWarnings, setPackWarnings] = useState<string[]>([]);

  const [refs, setRefs] = useState<OpeningRef[]>([]);
  const [stats, setStats] = useState<TrainingItemStats[]>([]);
  const [nodeStats, setNodeStats] = useState<OpeningNodeStats[]>([]);

  const [drillColor, setDrillColor] = useState<Color>('w');
  const [mode, setModeState] = useState<DrillMode>('nodes');

  const [current, setCurrent] = useState<OpeningRef | null>(null);
  const [currentNode, setCurrentNode] = useState<OpeningNodeRef | null>(null);
  const [initialFen, setInitialFen] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [index, setIndex] = useState<number>(0);

  const [running, setRunning] = useState<boolean>(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [showHintFlag, setShowHintFlag] = useState<boolean>(false);

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const { noticeText, showNotice, clearNotice } = useToastNotice(1500);

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
        setPackWarnings(br.warnings);
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

  const byKeyStats = useMemo(() => {
    const m = new Map<string, TrainingItemStats>();
    for (const s of stats) m.set(s.key, s);
    return m;
  }, [stats]);

  const byKeyNodeStats = useMemo(() => {
    const m = new Map<string, OpeningNodeStats>();
    for (const s of nodeStats) m.set(s.key, s);
    return m;
  }, [nodeStats]);

  const learnedNodeCount = useMemo(
    () => nodeStats.filter((s) => (s.attempts || 0) > 0).length,
    [nodeStats]
  );

  const openingNodesMemo = useMemo(() => {
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

  const openingNodes = openingNodesMemo.nodes;
  const openingNodesWarnings = openingNodesMemo.warnings;

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
    if (!showHintFlag || !expectedMove) return null;
    return { from: expectedMove.from, to: expectedMove.to };
  }, [showHintFlag, expectedMove]);

  const orientation: Orientation = drillColor;

  const fallbackState = useMemo(() => createInitialGameState(), []);

  const disabledForMoveInput = useMemo(() => {
    if (!running) return true;
    if (!state) return true;
    if (state.sideToMove !== drillColor) return true;
    return false;
  }, [running, state, drillColor]);

  const finishAttempt = useCallback(
    async (ref: OpeningRef | null, success: boolean, message: string) => {
      setRunning(false);
      setShowHintFlag(false);
      setResultMsg(message);

      if (!ref) return;
      const solveMs = Math.max(0, Date.now() - (startedAtRef.current || Date.now()));
      const nextStats = await recordAttempt({
        packId: ref.packId,
        itemId: ref.item.itemId,
        success,
        solveMs
      });
      setStats((prev) => {
        const out = prev.filter((s) => s.key !== nextStats.key);
        out.push(nextStats);
        out.sort((a, b) => a.key.localeCompare(b.key));
        return out;
      });
    },
    []
  );

  const finishNodeAttempt = useCallback(
    async (node: OpeningNodeRef | null, success: boolean, message: string) => {
      setRunning(false);
      setShowHintFlag(false);
      setResultMsg(message);

      if (!node) return;
      const solveMs = Math.max(0, Date.now() - (startedAtRef.current || Date.now()));
      const nextStats = await recordOpeningNodeAttempt({
        key: node.key,
        packId: node.packId,
        itemId: node.itemId,
        plyIndex: node.plyIndex,
        success,
        solveMs
      });

      setNodeStats((prev) => {
        const out = prev.filter((s) => s.key !== nextStats.key);
        out.push(nextStats);
        out.sort((a, b) => a.key.localeCompare(b.key));
        return out;
      });
    },
    []
  );

  const applyMoveForMode = useCallback(
    (move: Move) => {
      if (!running || !state) return;

      if (mode === 'nodes') {
        const node = currentNode;
        if (!node) return;

        const expected = expectedUci;
        if (!expected) {
          void finishNodeAttempt(node, true, 'Done.');
          return;
        }

        const expectedNorm = normalizeUci(expected);
        const played = normalizeUci(moveToUci(move));

        if (played !== expectedNorm) {
          void finishNodeAttempt(node, false, `Incorrect. Expected ${expectedNorm}. You played ${played}.`);
          return;
        }

        let nextState = applyMove(state, move);
        const nextIndex = node.plyIndex + 1;

        // Auto-play opponent replies for preview (until it's your turn again).
        const auto = autoPlayOpponentReplies(nextState, node.lineUci, nextIndex, drillColor);
        if (auto.error) {
          setState(auto.state);
          void finishNodeAttempt(node, false, auto.error);
          return;
        }
        nextState = auto.state;

        setState(nextState);
        setIndex(nextIndex);
        setSelectedSquare(null);
        setShowHintFlag(false);

        void finishNodeAttempt(node, true, 'Correct!');
        return;
      }

      // line mode
      const ref = current;
      if (!ref) return;

      const expected = expectedUci;
      if (!expected) {
        void finishAttempt(ref, true, 'Line complete.');
        return;
      }

      const expectedNorm = normalizeUci(expected);
      const played = normalizeUci(moveToUci(move));
      if (played !== expectedNorm) {
        void finishAttempt(ref, false, `Incorrect. Expected ${expected}. You played ${played}.`);
        return;
      }

      let nextState = applyMove(state, move);
      let nextIndex = index + 1;

      // Auto-play opponent replies if the line expects them.
      const auto = autoPlayOpponentReplies(nextState, ref.lineUci, nextIndex, drillColor);
      if (auto.error) {
        setState(auto.state);
        setIndex(auto.nextIndex);
        void finishAttempt(ref, false, auto.error);
        return;
      }
      nextState = auto.state;
      nextIndex = auto.nextIndex;

      setState(nextState);
      setIndex(nextIndex);
      setSelectedSquare(null);
      setShowHintFlag(false);

      if (nextIndex >= ref.lineUci.length) {
        void finishAttempt(ref, true, 'Nice! Line completed.');
      }
    },
    [running, state, mode, currentNode, current, expectedUci, drillColor, index, finishAttempt, finishNodeAttempt]
  );

  const moveInput = useMoveInput({
    state: state ?? fallbackState,
    selectedSquare,
    setSelectedSquare,
    pendingPromotion,
    setPendingPromotion,
    disabled: disabledForMoveInput,
    onMove: applyMoveForMode,
    showNotice,
    illegalNoticeMode: 'basic'
  });

  // Auto-choose promotion if the expected UCI fully specifies it.
  useEffect(() => {
    if (!pendingPromotion) return;
    const exp = expectedUci;
    if (!exp) return;
    const expNorm = normalizeUci(exp);
    const match = pendingPromotion.options.find((m) => normalizeUci(moveToUci(m)) === expNorm);
    if (match) moveInput.choosePromotion(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPromotion, expectedUci]);

  const resetToInitial = useCallback(() => {
    setPendingPromotion(null);

    if (mode === 'nodes') {
      if (!currentNode) return;
      const fen = currentNode.fen;
      const parsed = tryParseFEN(fen);
      if (!parsed.ok) {
        setResultMsg(`Invalid FEN: ${parsed.error}`);
        setState(null);
        setRunning(false);
        return;
      }

      setInitialFen(fen);
      setState(parsed.value);
      setIndex(currentNode.plyIndex);
      setSelectedSquare(null);
      setShowHintFlag(false);
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
      setRunning(false);
      return;
    }

    setInitialFen(fen);
    setState(parsed.value);
    setIndex(0);
    setSelectedSquare(null);
    setShowHintFlag(false);
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
  }, [mode, currentNode, current, drillColor]);

  const startNode = useCallback(
    (chosenNode: OpeningNodeRef) => {
      setPendingPromotion(null);
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
      setShowHintFlag(false);
      setRunning(true);
      startedAtRef.current = Date.now();
    },
    []
  );

  const startDrill = useCallback(
    (ref?: OpeningRef | null) => {
      setPendingPromotion(null);

      if (mode === 'nodes') {
        const ts = Date.now();
        let candidates = openingNodes;

        // If a line was explicitly chosen, drill nodes within that line.
        if (ref) {
          candidates = openingNodes.filter((n) => n.packId === ref.packId && n.itemId === ref.item.itemId);
        }

        const chosenNode = pickNextOpeningNode(candidates, nodeStats, ts, focusNodeKey ?? null);

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
      const parsed2 = tryParseFEN(fen);
      if (!parsed2.ok) {
        setResultMsg(`Invalid FEN: ${parsed2.error}`);
        setState(null);
        setRunning(false);
        return;
      }

      setInitialFen(fen);
      let s = parsed2.value;
      let i = 0;

      startedAtRef.current = Date.now();
      setRunning(true);
      setShowHintFlag(false);
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
    },
    [mode, openingNodes, nodeStats, focusNodeKey, startNode, refs, stats, focusKey, drillColor]
  );

  const stopSession = useCallback(() => {
    setRunning(false);
    setShowHintFlag(false);
    setResultMsg(null);
    setPendingPromotion(null);

    if (mode === 'nodes') {
      setCurrentNode(null);
    } else {
      setCurrent(null);
    }
  }, [mode]);

  const backToList = useCallback(() => {
    setRunning(false);
    setShowHintFlag(false);
    setResultMsg(null);
    setPendingPromotion(null);

    setCurrent(null);
    setCurrentNode(null);
    setState(null);
    setIndex(0);
    setInitialFen(null);
    setSelectedSquare(null);
  }, []);

  const toggleHint = useCallback(() => setShowHintFlag((v) => !v), []);
  const showHint = useCallback(() => setShowHintFlag(true), []);

  const setMode = useCallback(
    (m: DrillMode) => {
      setModeState(m);
      // Switching mode should reset session to avoid mixed state.
      backToList();
    },
    [backToList]
  );

  useGlobalHotkeys(
    [
      { key: 'h', onKey: () => toggleHint() },
      { key: 'n', onKey: () => startDrill(null) },
      { key: 'r', onKey: () => resetToInitial() },
      { key: 's', onKey: () => showHint() }
    ],
    [running, current, currentNode, drillColor, mode, startDrill, resetToInitial, toggleHint, showHint]
  );

  return {
    status,
    error,
    packWarnings,

    refs,
    stats,
    byKeyStats,

    openingNodes,
    openingNodesWarnings,
    nodeStats,
    byKeyNodeStats,
    learnedNodeCount,

    drillColor,
    setDrillColor,

    mode,
    setMode,

    orientation,

    running,
    resultMsg,
    noticeText,
    showHintFlag,

    state,
    initialFen,
    index,

    current,
    currentNode,

    expectedUci,
    hintMove,

    pendingPromotion,
    moveInput,

    startDrill,
    startNode,
    resetToInitial,

    stopSession,
    backToList,

    toggleHint,
    showHint
  };
}
