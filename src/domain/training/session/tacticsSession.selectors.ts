import type { Square } from '../../chessTypes';
import { findKing, isInCheck } from '../../attack';

import type { TacticsAttemptState } from './tacticsSession.types';

export function selectTacticsDisplayedLine(session: TacticsAttemptState | null): string[] | null {
  if (!session) return null;
  // Before the first correct move we might have multiple alternatives; show the first.
  return session.activeLine ?? session.solutionLines[0] ?? null;
}

export function selectTacticsProgressText(session: TacticsAttemptState | null): string | null {
  const displayedLine = selectTacticsDisplayedLine(session);
  if (!session || !displayedLine) return null;
  const totalUserMoves = Math.ceil(displayedLine.length / 2);
  const nextUserMoveIndex = Math.floor(session.ply / 2) + 1;
  return `Move ${Math.min(totalUserMoves, nextUserMoveIndex)} / ${totalUserMoves}`;
}

export function selectTacticsCheckSquares(session: TacticsAttemptState | null): Square[] {
  if (!session) return [];
  const stm = session.state.sideToMove;
  if (!isInCheck(session.state, stm)) return [];
  const k = findKing(session.state, stm);
  return k == null ? [] : [k];
}

export function selectTacticsHintMove(session: TacticsAttemptState | null): { from: Square; to: Square } | null {
  const h = session?.hint;
  if (!h) return null;
  if (h.kind === 'nudge' || h.kind === 'move') {
    if (h.from != null && h.to != null) return { from: h.from, to: h.to };
  }
  return null;
}
