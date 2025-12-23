import type { Color, GameState, Piece, Square } from './chessTypes';
import { oppositeColor } from './chessTypes';
import { fileOf, rankOf } from './square';
import { generateLegalMoves } from './legalMoves';
import { isInCheck } from './attack';

export type GameStatus =
  | { kind: 'inProgress' }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'drawInsufficientMaterial' };

function squareColorParity(square: Square): 0 | 1 {
  // a1 is 0 (dark), b1 is 1 (light), etc. We only need parity comparisons.
  return ((fileOf(square) + rankOf(square)) % 2) as 0 | 1;
}

function isInsufficientMaterialMinimumSet(state: GameState): boolean {
  const nonKingPieces: Array<{ piece: Piece; square: Square }> = [];
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p) continue;
    if (p.type === 'k') continue;
    nonKingPieces.push({ piece: p, square: i as Square });
  }

  if (nonKingPieces.length === 0) return true; // K vs K

  // Any pawns, rooks, or queens mean sufficient material.
  if (nonKingPieces.some(({ piece }) => piece.type === 'p' || piece.type === 'r' || piece.type === 'q')) {
    return false;
  }

  if (nonKingPieces.length === 1) {
    const t = nonKingPieces[0].piece.type;
    return t === 'n' || t === 'b'; // K+N vs K, K+B vs K
  }

  if (nonKingPieces.length === 2) {
    const a = nonKingPieces[0];
    const b = nonKingPieces[1];
    // K+B vs K+B (bishops on same color)
    if (a.piece.type === 'b' && b.piece.type === 'b' && a.piece.color !== b.piece.color) {
      return squareColorParity(a.square) === squareColorParity(b.square);
    }
  }

  return false;
}

export function getGameStatus(state: GameState): GameStatus {
  if (isInsufficientMaterialMinimumSet(state)) {
    return { kind: 'drawInsufficientMaterial' };
  }

  const legal = generateLegalMoves(state);
  if (legal.length > 0) return { kind: 'inProgress' };

  // No legal moves: checkmate if in check, else stalemate.
  const stm = state.sideToMove;
  if (isInCheck(state, stm)) {
    return { kind: 'checkmate', winner: oppositeColor(stm) };
  }
  return { kind: 'stalemate' };
}
