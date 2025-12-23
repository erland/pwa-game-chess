import type { CastlingRights, GameState } from './chessTypes';
import { createStartingBoard } from './board';

export const STARTING_CASTLING_RIGHTS: CastlingRights = {
  wK: true,
  wQ: true,
  bK: true,
  bQ: true
};

export function createInitialGameState(): GameState {
  return {
    board: createStartingBoard(),
    sideToMove: 'w',
    castling: { ...STARTING_CASTLING_RIGHTS },
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    history: [],
    forcedStatus: null
  };
}