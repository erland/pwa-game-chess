import type { Board, Color, Piece, PieceType, Square } from './chessTypes';
import { makeSquare } from './square';

export function createEmptyBoard(): Board {
  return Array.from({ length: 64 }, () => null);
}

export function getPiece(board: Board, square: Square): Piece | null {
  return board[square] ?? null;
}

export function setPiece(board: Board, square: Square, piece: Piece | null): Board {
  const next = board.slice();
  next[square] = piece;
  return next;
}

function piece(color: Color, type: PieceType): Piece {
  return { color, type };
}

function placeMutable(board: Board, file: number, rank: number, p: Piece) {
  const sq = makeSquare(file, rank);
  if (sq === null) throw new Error(`Invalid square (file=${file}, rank=${rank})`);
  board[sq] = p;
}

/**
 * Standard chess starting position.
 *
 * Board convention is 0=a1..63=h8.
 */
export function createStartingBoard(): Board {
  const b = createEmptyBoard();

  // White pieces
  placeMutable(b, 0, 0, piece('w', 'r')); // a1
  placeMutable(b, 1, 0, piece('w', 'n')); // b1
  placeMutable(b, 2, 0, piece('w', 'b')); // c1
  placeMutable(b, 3, 0, piece('w', 'q')); // d1
  placeMutable(b, 4, 0, piece('w', 'k')); // e1
  placeMutable(b, 5, 0, piece('w', 'b')); // f1
  placeMutable(b, 6, 0, piece('w', 'n')); // g1
  placeMutable(b, 7, 0, piece('w', 'r')); // h1
  for (let file = 0; file < 8; file++) {
    placeMutable(b, file, 1, piece('w', 'p')); // rank 2
  }

  // Black pieces
  placeMutable(b, 0, 7, piece('b', 'r')); // a8
  placeMutable(b, 1, 7, piece('b', 'n')); // b8
  placeMutable(b, 2, 7, piece('b', 'b')); // c8
  placeMutable(b, 3, 7, piece('b', 'q')); // d8
  placeMutable(b, 4, 7, piece('b', 'k')); // e8
  placeMutable(b, 5, 7, piece('b', 'b')); // f8
  placeMutable(b, 6, 7, piece('b', 'n')); // g8
  placeMutable(b, 7, 7, piece('b', 'r')); // h8
  for (let file = 0; file < 8; file++) {
    placeMutable(b, file, 6, piece('b', 'p')); // rank 7
  }

  return b;
}

export function countPieces(board: Board): number {
  let n = 0;
  for (const sq of board) {
    if (sq) n++;
  }
  return n;
}

export function cloneBoard(board: Board): Board {
  // Pieces are small POJOs; shallow clone is enough for immutability in v1.
  return board.map((p) => (p ? { ...p } : null));
}
