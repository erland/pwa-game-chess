import type { Square } from '../../chessTypes';
import { findKing, isInCheck } from '../../attack';

import type { EndgamesSessionState } from './endgamesSession.types';

export function selectEndgamesOrientation(session: EndgamesSessionState): 'w' | 'b' {
  return session.ref ? session.playerColor : 'w';
}

export function selectEndgamesCheckSquares(session: EndgamesSessionState): Square[] {
  if (!session.state) return [];
  const stm = session.state.sideToMove;
  if (!isInCheck(session.state, stm)) return [];
  const k = findKing(session.state, stm);
  return k == null ? [] : [k];
}

export function selectEndgamesHintMove(session: EndgamesSessionState): { from: Square; to: Square } | null {
  const h = session.hint;
  if (!h) return null;
  if (h.kind === 'nudge' || h.kind === 'move') {
    if (h.from != null && h.to != null) return { from: h.from, to: h.to };
  }
  return null;
}
