import type { Color, GameState, Move, Square } from './chessTypes';
import { oppositeColor } from './chessTypes';
import { isInCheck, isSquareAttacked } from './attack';
import { generatePseudoLegalMoves } from './movegen';
import { applyMoveForValidation } from './applyMove';
import { fileOf, makeSquare, rankOf } from './square';

function castlePathSquares(from: Square, to: Square): Square[] {
  // For king-side: e1->g1 passes through f1; include destination.
  // For queen-side: e1->c1 passes through d1; include destination.
  const fFrom = fileOf(from);
  const rFrom = rankOf(from);
  const fTo = fileOf(to);
  const dir = Math.sign(fTo - fFrom);
  const squares: Square[] = [];
  // Step one square at a time on the rank, excluding the from square
  let f = fFrom + dir;
  while (f !== fTo + dir) {
    const sq = makeSquare(f, rFrom);
    if (sq !== null) squares.push(sq);
    if (f === fTo) break;
    f += dir;
  }
  return squares;
}

function isCastleLegal(state: GameState, move: Move): boolean {
  if (!move.isCastle) return true;
  const color = state.sideToMove;
  const enemy: Color = oppositeColor(color);

  // King cannot castle out of check.
  if (isInCheck(state, color)) return false;

  // King cannot pass through or land on attacked squares.
  const path = castlePathSquares(move.from, move.to);
  // For castling, path will include the intermediate square(s) + destination square.
  for (const sq of path) {
    if (isSquareAttacked(state, sq, enemy)) return false;
  }
  return true;
}

/**
 * Step 5: Legal move generation.
 *
 * Filters pseudo-legal moves by king safety:
 * - a move is legal if after making it, your king is not in check.
 * - castling additionally requires not being in check and not passing through check.
 */
export function generateLegalMoves(state: GameState, fromSquare?: Square): Move[] {
  const pseudo = generatePseudoLegalMoves(state, fromSquare);
  const color = state.sideToMove;

  const legal: Move[] = [];
  for (const m of pseudo) {
    if (m.isCastle && !isCastleLegal(state, m)) continue;

    const next = applyMoveForValidation(state, m);
    // After a move, the mover's king must not be in check.
    // (next.sideToMove is flipped, so we pass original color)
    if (!isInCheck(next, color)) {
      legal.push(m);
    }
  }
  return legal;
}
