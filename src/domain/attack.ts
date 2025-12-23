import type { Board, Color, GameState, Piece, Square } from './chessTypes';
import { fileOf, makeSquare, rankOf } from './square';

function getPiece(board: Board, sq: Square): Piece | null {
  return board[sq] ?? null;
}

function isOnBoard(file: number, rank: number): boolean {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function findKingSquare(board: Board, color: Color): Square | null {
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p && p.type === 'k' && p.color === color) return sq;
  }
  return null;
}

/**
 * Step 5: attack detection
 *
 * Returns true if `square` is attacked by any piece of `byColor`.
 *
 * Notes:
 * - This function is purely geometric: it does not consider pins or king safety.
 * - En passant is not considered an "attack" on the ep target square for king safety.
 */
export function isSquareAttacked(state: GameState, square: Square, byColor: Color): boolean {
  const board = state.board;

  const f = fileOf(square);
  const r = rankOf(square);

  // Pawn attacks (reverse lookup from target square)
  if (byColor === 'w') {
    // White pawns attack from one rank below.
    const fromRank = r - 1;
    if (fromRank >= 0) {
      for (const df of [-1, 1]) {
        const ff = f + df;
        if (!isOnBoard(ff, fromRank)) continue;
        const from = makeSquare(ff, fromRank)!;
        const p = getPiece(board, from);
        if (p && p.color === 'w' && p.type === 'p') return true;
      }
    }
  } else {
    // Black pawns attack from one rank above.
    const fromRank = r + 1;
    if (fromRank <= 7) {
      for (const df of [-1, 1]) {
        const ff = f + df;
        if (!isOnBoard(ff, fromRank)) continue;
        const from = makeSquare(ff, fromRank)!;
        const p = getPiece(board, from);
        if (p && p.color === 'b' && p.type === 'p') return true;
      }
    }
  }

  // Knight attacks
  const knightDeltas = [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2]
  ] as const;

  for (const [df, dr] of knightDeltas) {
    const nf = f + df;
    const nr = r + dr;
    if (!isOnBoard(nf, nr)) continue;
    const from = makeSquare(nf, nr)!;
    const p = getPiece(board, from);
    if (p && p.color === byColor && p.type === 'n') return true;
  }

  // Sliding attacks: rook/queen (orthogonal) and bishop/queen (diagonal)
  const rookDirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ] as const;

  for (const [df, dr] of rookDirs) {
    let nf = f + df;
    let nr = r + dr;
    while (isOnBoard(nf, nr)) {
      const sq = makeSquare(nf, nr)!;
      const p = getPiece(board, sq);
      if (p) {
        if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true;
        break;
      }
      nf += df;
      nr += dr;
    }
  }

  const bishopDirs = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ] as const;

  for (const [df, dr] of bishopDirs) {
    let nf = f + df;
    let nr = r + dr;
    while (isOnBoard(nf, nr)) {
      const sq = makeSquare(nf, nr)!;
      const p = getPiece(board, sq);
      if (p) {
        if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true;
        break;
      }
      nf += df;
      nr += dr;
    }
  }

  // King attacks (adjacent squares)
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const nf = f + df;
      const nr = r + dr;
      if (!isOnBoard(nf, nr)) continue;
      const from = makeSquare(nf, nr)!;
      const p = getPiece(board, from);
      if (p && p.color === byColor && p.type === 'k') return true;
    }
  }

  return false;
}

export function isInCheck(state: GameState, color: Color): boolean {
  const kingSq = findKingSquare(state.board, color);
  if (kingSq === null) return false; // should not happen in valid positions
  const attacker = color === 'w' ? 'b' : 'w';
  return isSquareAttacked(state, kingSq, attacker);
}

export function findKing(state: GameState, color: Color): Square | null {
  return findKingSquare(state.board, color);
}
