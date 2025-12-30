import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSessionEffectRunner } from '../useSessionEffectRunner';

import { useGlobalHotkeys } from '../../../ui/useGlobalHotkeys';
import { useToastNotice } from '../../game/useToastNotice';
import { useMoveInput, type PendingPromotion } from '../../../ui/chessboard/useMoveInput';

import type { Color, GameState, Move, Square } from '../../../domain/chessTypes';
import type { Orientation } from '../../../domain/localSetup';
import { createInitialGameState } from '../../../domain/gameState';
import { moveToUci } from '../../../domain/notation/uci';

import { parseItemKey, type TrainingItemKey } from '../../../domain/training/keys';
import { normalizeUci } from '../../../domain/training/openingsDrill';
import { buildOpeningNodes, pickNextOpeningNode, type OpeningNodeRef } from '../../../domain/training/openingNodes';
import { buildOpeningRefs } from '../../../domain/training/openingRefs';
import { pickNextOpening } from '../../../domain/training/pickers/openingsPicker';

import { useTrainingPacks } from '../hooks/useTrainingPacks';
import { useTrainingItemStats } from '../hooks/useTrainingItemStats';
import { useOpeningNodeStats } from '../hooks/useOpeningNodeStats';

import {
  createOpeningsSessionState,
  reduceOpeningsSession
} from '../../../domain/training/session/openingsSession';
import {
  selectOpeningsDisabledForMoveInput,
  selectOpeningsExpectedUci,
  selectOpeningsHintMove
} from '../../../domain/training/session/openingsSession.selectors';
import type {
  DrillMode,
  OpeningRef,
  OpeningsSessionAction,
  OpeningsSessionEffect,
  OpeningsSessionState
} from '../../../domain/training/session/openingsSession.types';

import type { TrainingItemStats } from '../../../storage/training/trainingStore';
import type { OpeningNodeStats } from '../../../storage/training/openingNodeStore';

import {
  recordOpeningNodeAttemptProgress,
  recordTrainingItemAttempt
} from '../../../services/training/trainingProgressRepo';

export type Status = 'idle' | 'loading' | 'ready' | 'error';
export type { DrillMode, OpeningRef };

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

  const packs = useTrainingPacks();
  const itemStats = useTrainingItemStats(packs.state.status);
  const nodeStatsHook = useOpeningNodeStats(packs.state.status);

  const refsRes = useMemo(() => {
    if (packs.state.status !== 'ready') return { refs: [] as OpeningRef[], warnings: [] as string[] };
    return buildOpeningRefs(packs.state.packs);
  }, [packs.state]);

  const refs = refsRes.refs;

  const packWarnings = useMemo(() => {
    const loadErrors = packs.state.status === 'ready' ? packs.state.errors : [];
    return [...loadErrors, ...refsRes.warnings];
  }, [packs.state, refsRes.warnings]);

  const stats = itemStats.state.status === 'ready' ? itemStats.state.stats : [];
  const nodeStats = nodeStatsHook.state.status === 'ready' ? nodeStatsHook.state.stats : [];

  const status: Status = useMemo(() => {
    const anyLoading =
      packs.state.status === 'loading' || itemStats.state.status === 'loading' || nodeStatsHook.state.status === 'loading';
    if (anyLoading) return 'loading';
    const anyError =
      packs.state.status === 'error' || itemStats.state.status === 'error' || nodeStatsHook.state.status === 'error';
    if (anyError) return 'error';
    return 'ready';
  }, [packs.state.status, itemStats.state.status, nodeStatsHook.state.status]);

  const error: string | null = useMemo(() => {
    if (packs.state.status === 'error') return packs.state.message;
    if (itemStats.state.status === 'error') return itemStats.state.message;
    if (nodeStatsHook.state.status === 'error') return nodeStatsHook.state.message;
    return null;
  }, [packs.state, itemStats.state, nodeStatsHook.state]);

  const effectsRef = useRef<OpeningsSessionEffect[]>([]);
  const reducer = useCallback(
    (prev: OpeningsSessionState, action: OpeningsSessionAction): OpeningsSessionState => {
      const res = reduceOpeningsSession(prev, action);
      if (res.effects.length > 0) effectsRef.current.push(...res.effects);
      return res.state;
    },
    []
  );

  const [session, dispatch] = useReducer(reducer, createOpeningsSessionState());

  const drillColor = session.drillColor;
  const mode = session.mode;
  const current = session.current;
  const currentNode = session.currentNode;
  const initialFen = session.initialFen;
  const state = session.state;
  const index = session.index;
  const running = session.running;
  const resultMsg = session.resultMsg;
  const showHintFlag = session.showHintFlag;

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const { noticeText, showNotice, clearNotice } = useToastNotice(1500);


  const byKeyStats = itemStats.byKey;
  const byKeyNodeStats = nodeStatsHook.byKey;

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

  const expectedUci = useMemo(() => selectOpeningsExpectedUci(session), [session]);
  const hintMove = useMemo(() => selectOpeningsHintMove(session), [session]);
  const orientation = session.orientation;

  const fallbackState = useMemo(() => createInitialGameState(), []);

  const disabledForMoveInput = useMemo(() => selectOpeningsDisabledForMoveInput(session), [session]);

  const applyMoveForMode = useCallback(
    (move: Move) => {
      if (!running) return;
      setSelectedSquare(null);
      dispatch({ type: 'APPLY_MOVE', move, nowMs: Date.now() });
    },
    [running, dispatch]
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

  // Effect runner for reducer effects (record attempts).
  const runEffect = useCallback(
    (eff: OpeningsSessionEffect) => {
      switch (eff.kind) {
        case 'RECORD_LINE_ATTEMPT': {
          void (async () => {
            try {
              const nextStats = await recordTrainingItemAttempt({
                packId: eff.packId,
                itemId: eff.itemId,
                success: eff.success,
                solveMs: eff.solveMs
              });
              itemStats.upsert(nextStats);
            } catch {
              // ignore
            }
          })();
          break;
        }

        case 'RECORD_NODE_ATTEMPT': {
          void (async () => {
            try {
              const nextStats = await recordOpeningNodeAttemptProgress({
                key: eff.key,
                packId: eff.packId,
                itemId: eff.itemId,
                plyIndex: eff.plyIndex,
                success: eff.success,
                solveMs: eff.solveMs
              });
              nodeStatsHook.upsert(nextStats);
            } catch {
              // ignore
            }
          })();
          break;
        }
      }
    },
    [itemStats, nodeStatsHook]
  );

  useSessionEffectRunner(effectsRef, runEffect, [session]);


  const resetToInitial = useCallback(() => {
    clearNotice();
    setPendingPromotion(null);
    setSelectedSquare(null);
    dispatch({ type: 'RESET_TO_INITIAL', nowMs: Date.now() });
  }, [clearNotice, dispatch]);

  const startNode = useCallback(
    (chosenNode: OpeningNodeRef) => {
      clearNotice();
      setPendingPromotion(null);
      setSelectedSquare(null);
      dispatch({ type: 'START_NODE', node: chosenNode, nowMs: Date.now() });
    },
    [clearNotice, dispatch]
  );

  const startDrill = useCallback(
    (ref?: OpeningRef | null) => {
      clearNotice();
      setPendingPromotion(null);
      setSelectedSquare(null);

      if (mode === 'nodes') {
        const ts = Date.now();
        let candidates = openingNodes;
        // If a line was explicitly chosen, drill nodes within that line.
        if (ref) {
          candidates = openingNodes.filter((n) => n.packId === ref.packId && n.itemId === ref.item.itemId);
        }

        const chosenNode = pickNextOpeningNode(candidates, nodeStats, ts, focusNodeKey ?? null);
        if (!chosenNode) {
          dispatch({ type: 'SET_RESULT_MSG', message: 'No opening nodes found (no UCI opening lines in packs).' });
          return;
        }
        dispatch({ type: 'START_NODE', node: chosenNode, nowMs: ts });
        return;
      }

      const ts = Date.now();
      const chosen = ref ?? pickNextOpening(refs, stats, ts, focusKey);
      if (!chosen) {
        dispatch({ type: 'SET_RESULT_MSG', message: 'No opening lines found in packs.' });
        return;
      }

      dispatch({ type: 'START_LINE', ref: chosen, nowMs: ts });
    },
    [clearNotice, dispatch, mode, openingNodes, nodeStats, focusNodeKey, refs, stats, focusKey]
  );

  const stopSession = useCallback(() => {
    clearNotice();
    setPendingPromotion(null);
    setSelectedSquare(null);
    dispatch({ type: 'STOP_SESSION' });
  }, [clearNotice, dispatch]);

  const backToList = useCallback(() => {
    clearNotice();
    setPendingPromotion(null);
    setSelectedSquare(null);
    dispatch({ type: 'BACK_TO_LIST' });
  }, [clearNotice, dispatch]);

  const toggleHint = useCallback(() => dispatch({ type: 'TOGGLE_HINT' }), [dispatch]);
  const showHint = useCallback(() => dispatch({ type: 'SHOW_HINT' }), [dispatch]);

  const setDrillColor = useCallback((c: Color) => dispatch({ type: 'SET_DRILL_COLOR', color: c }), [dispatch]);

  const setMode = useCallback(
    (m: DrillMode) => {
      clearNotice();
      setPendingPromotion(null);
      setSelectedSquare(null);
      dispatch({ type: 'SET_MODE', mode: m });
    },
    [clearNotice, dispatch]
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
