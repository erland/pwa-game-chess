export type {
  Board,
  CastlingRights,
  Color,
  GameState,
  Move,
  Piece,
  PieceType,
  Square
} from './chessTypes';

export { oppositeColor } from './chessTypes';

export {
  FILES,
  RANKS,
  fileOf,
  isSquare,
  makeSquare,
  mirrorFile,
  mirrorRank,
  parseAlgebraicSquare,
  rankOf,
  toAlgebraic
} from './square';

export { cloneBoard, countPieces, createEmptyBoard, createStartingBoard, getPiece, setPiece } from './board';

export { createInitialGameState, STARTING_CASTLING_RIGHTS } from './gameState';

export { generatePseudoLegalMoves } from './movegen';

export type { LocalGameSetup, Orientation, TimeControl } from './localSetup';
export {
  DEFAULT_LOCAL_SETUP,
  TIME_CONTROL_PRESETS,
  formatOrientation,
  formatTimeControl,
  parseOrientationParam,
  parseTimeControlParam,
  serializeTimeControlParam
} from './localSetup';

export { isInCheck, isSquareAttacked } from './attack';
export { generateLegalMoves } from './legalMoves';

export { applyMove } from './applyMove';
export type { GameAction } from './reducer';
export { gameReducer } from './reducer';
