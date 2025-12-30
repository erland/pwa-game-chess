import type { Color } from '../../chessTypes';

import type { DrillMode, OpeningRef, OpeningsSessionEffect, OpeningsSessionState } from './openingsSession.types';
import type { OpeningNodeRef } from '../openingNodes';

export function defaultOpeningsSessionState(): OpeningsSessionState {
  return {
    mode: 'nodes',
    drillColor: 'w',
    orientation: 'w',

    current: null,
    currentNode: null,

    initialFen: null,
    state: null,
    index: 0,

    running: false,
    resultMsg: null,
    showHintFlag: false,
    startedAtMs: 0
  };
}

export function solveMsFrom(startedAtMs: number, nowMs: number): number {
  if (!startedAtMs) return 0;
  return Math.max(0, Math.round(nowMs - startedAtMs));
}

export function expectedUci(
  mode: DrillMode,
  current: OpeningRef | null,
  currentNode: OpeningNodeRef | null,
  index: number
): string | null {
  if (mode === 'nodes') return currentNode?.expectedUci ?? null;
  if (!current) return null;
  return current.lineUci[index] ?? null;
}

export function pushLineAttempt(
  effects: OpeningsSessionEffect[],
  ref: OpeningRef,
  success: boolean,
  solveMs: number
): void {
  effects.push({ kind: 'RECORD_LINE_ATTEMPT', packId: ref.packId, itemId: ref.item.itemId, success, solveMs });
}

export function pushNodeAttempt(
  effects: OpeningsSessionEffect[],
  node: OpeningNodeRef,
  success: boolean,
  solveMs: number
): void {
  effects.push({
    kind: 'RECORD_NODE_ATTEMPT',
    key: node.key,
    packId: node.packId,
    itemId: node.itemId,
    plyIndex: node.plyIndex,
    success,
    solveMs
  });
}

export function drillColorForFenSideToMove(sideToMove: Color): Color {
  // For line mode, default drill color follows the side to move in the FEN.
  return sideToMove;
}
