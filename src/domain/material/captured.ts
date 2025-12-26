import type { Color, GameState, PieceType } from '../chessTypes';
import { oppositeColor } from '../chessTypes';

export type CapturedPieces = {
  /** Pieces captured by White (i.e. Black pieces). */
  w: PieceType[];
  /** Pieces captured by Black (i.e. White pieces). */
  b: PieceType[];
};

export function pieceValue(t: PieceType): number {
  switch (t) {
    case 'p':
      return 1;
    case 'n':
    case 'b':
      return 3;
    case 'r':
      return 5;
    case 'q':
      return 9;
    case 'k':
      return 0;
    default:
      return 0;
  }
}

/** Sort captured pieces into a stable, useful display order. */
export function sortCaptured(pieces: PieceType[]): PieceType[] {
  const rank = (t: PieceType): number => {
    switch (t) {
      case 'q':
        return 0;
      case 'r':
        return 1;
      case 'b':
        return 2;
      case 'n':
        return 3;
      case 'p':
        return 4;
      case 'k':
        return 5;
      default:
        return 9;
    }
  };
  return [...pieces].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

/**
 * Compute captured pieces from a state history.
 *
 * This relies on applyMove() populating move.captured (which our engine does).
 * For future FEN-start support, provide startSideToMove to compute mover colors.
 */
export function getCapturedPiecesFromState(
  state: GameState,
  startSideToMove: Color = 'w'
): CapturedPieces {
  const captured: CapturedPieces = { w: [], b: [] };
  for (let i = 0; i < state.history.length; i += 1) {
    const mover = i % 2 === 0 ? startSideToMove : oppositeColor(startSideToMove);
    const cap = state.history[i]?.captured ?? null;
    if (cap) captured[mover].push(cap.type);
  }
  captured.w = sortCaptured(captured.w);
  captured.b = sortCaptured(captured.b);
  return captured;
}

/**
 * Material delta from captures only.
 * Positive => White is ahead (White has captured more value than Black).
 */
export function captureMaterialDelta(captured: CapturedPieces): number {
  const sum = (arr: PieceType[]) => arr.reduce((acc, t) => acc + pieceValue(t), 0);
  return sum(captured.w) - sum(captured.b);
}
