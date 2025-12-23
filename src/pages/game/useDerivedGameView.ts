import { useMemo } from 'react';

import type { GameState, Square } from '../../domain/chessTypes';
import { findKing, isInCheck } from '../../domain/attack';
import { getGameStatus } from '../../domain/gameStatus';

export function useDerivedGameView(state: GameState) {
  const status = useMemo(() => getGameStatus(state), [state]);
  const isGameOver = status.kind !== 'inProgress';

  const inCheck = useMemo(() => {
    if (status.kind !== 'inProgress') return false;
    return isInCheck(state, state.sideToMove);
  }, [state, status.kind]);

  const lastMove = useMemo(() => {
    if (state.history.length === 0) return null;
    const m = state.history[state.history.length - 1];
    return { from: m.from, to: m.to };
  }, [state.history]);

  const checkSquares = useMemo(() => {
    if (status.kind !== 'inProgress') return [] as Square[];
    if (!inCheck) return [] as Square[];
    const k = findKing(state, state.sideToMove);
    return k === null ? ([] as Square[]) : [k];
  }, [state, status.kind, inCheck]);

  return { status, isGameOver, inCheck, lastMove, checkSquares };
}
