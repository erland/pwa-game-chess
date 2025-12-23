import type { Board, Color, GameState, Move, Piece, PieceType, Square } from './chessTypes';
import { fileOf, makeSquare, rankOf } from './square';

/**
 * Step 4: Pseudo-legal move generation.
 *
 * Pseudo-legal means: piece movement rules are respected, but king safety is NOT checked.
 * (Filtering to legal moves happens in Step 5.)
 */

const PROMOTION_PIECES: Array<Exclude<PieceType, 'k' | 'p'>> = ['q', 'r', 'b', 'n'];

function getPiece(board: Board, sq: Square): Piece | null {
  return board[sq] ?? null;
}

function isOnBoard(file: number, rank: number): boolean {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function pushMove(moves: Move[], from: Square, to: Square, opts?: Partial<Move>) {
  moves.push({ from, to, ...opts });
}

function addPromotionMoves(moves: Move[], from: Square, to: Square, opts?: Partial<Move>) {
  for (const p of PROMOTION_PIECES) {
    pushMove(moves, from, to, { ...opts, promotion: p });
  }
}

function addPawnMoves(state: GameState, from: Square, moves: Move[]) {
  const piece = getPiece(state.board, from);
  if (!piece || piece.type !== 'p') return;

  const f = fileOf(from);
  const r = rankOf(from);
  const dir = piece.color === 'w' ? 1 : -1; // rank direction
  const startRank = piece.color === 'w' ? 1 : 6;
  const promotionRank = piece.color === 'w' ? 7 : 0;

  // Single push
  const one = makeSquare(f, r + dir);
  if (one !== null && getPiece(state.board, one) === null) {
    if (rankOf(one) === promotionRank) {
      addPromotionMoves(moves, from, one);
    } else {
      pushMove(moves, from, one);
    }

    // Double push from starting rank (only if single push is clear)
    const two = makeSquare(f, r + dir * 2);
    if (r === startRank && two !== null && getPiece(state.board, two) === null) {
      pushMove(moves, from, two);
    }
  }

  // Captures (diagonals)
  for (const df of [-1, 1]) {
    const cap = makeSquare(f + df, r + dir);
    if (cap === null) continue;
    const target = getPiece(state.board, cap);
    if (target && target.color !== piece.color) {
      if (rankOf(cap) === promotionRank) {
        addPromotionMoves(moves, from, cap);
      } else {
        pushMove(moves, from, cap);
      }
    }

    // En passant candidate
    if (state.enPassantTarget !== null && cap === state.enPassantTarget) {
      // Note: we don't validate the captured pawn existence here beyond that the EP square matches.
      // Validation + execution happens in applyMove.
      pushMove(moves, from, cap, { isEnPassant: true });
    }
  }
}

function addKnightMoves(state: GameState, from: Square, moves: Move[]) {
  const piece = getPiece(state.board, from);
  if (!piece || piece.type !== 'n') return;

  const f = fileOf(from);
  const r = rankOf(from);
  const deltas = [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2]
  ] as const;

  for (const [df, dr] of deltas) {
    const nf = f + df;
    const nr = r + dr;
    if (!isOnBoard(nf, nr)) continue;
    const to = makeSquare(nf, nr)!;
    const target = getPiece(state.board, to);
    if (!target || target.color !== piece.color) {
      pushMove(moves, from, to);
    }
  }
}

function addKingMoves(state: GameState, from: Square, moves: Move[]) {
  const piece = getPiece(state.board, from);
  if (!piece || piece.type !== 'k') return;

  const f = fileOf(from);
  const r = rankOf(from);

  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const nf = f + df;
      const nr = r + dr;
      if (!isOnBoard(nf, nr)) continue;
      const to = makeSquare(nf, nr)!;
      const target = getPiece(state.board, to);
      if (!target || target.color !== piece.color) {
        pushMove(moves, from, to);
      }
    }
  }

  // Castling candidates (no check validation here; Step 5).
  addCastleCandidates(state, from, moves);
}

function addCastleCandidates(state: GameState, from: Square, moves: Move[]) {
  const king = getPiece(state.board, from);
  if (!king || king.type !== 'k') return;

  const isWhite = king.color === 'w';
  const homeRank = isWhite ? 0 : 7;
  const kingHome = makeSquare(4, homeRank);
  if (kingHome === null || from !== kingHome) return;

  // Require king to actually be on home square for castle candidates.
  // Also require the rook to exist on the expected square.

  // King-side
  const canK = isWhite ? state.castling.wK : state.castling.bK;
  if (canK) {
    const rookSq = makeSquare(7, homeRank)!;
    const rook = getPiece(state.board, rookSq);
    const f1 = makeSquare(5, homeRank)!;
    const g1 = makeSquare(6, homeRank)!;
    if (rook && rook.type === 'r' && rook.color === king.color) {
      if (getPiece(state.board, f1) === null && getPiece(state.board, g1) === null) {
        pushMove(moves, from, g1, { isCastle: true, castleSide: 'k' });
      }
    }
  }

  // Queen-side
  const canQ = isWhite ? state.castling.wQ : state.castling.bQ;
  if (canQ) {
    const rookSq = makeSquare(0, homeRank)!;
    const rook = getPiece(state.board, rookSq);
    const d1 = makeSquare(3, homeRank)!;
    const c1 = makeSquare(2, homeRank)!;
    const b1 = makeSquare(1, homeRank)!;
    if (rook && rook.type === 'r' && rook.color === king.color) {
      if (getPiece(state.board, d1) === null && getPiece(state.board, c1) === null && getPiece(state.board, b1) === null) {
        pushMove(moves, from, c1, { isCastle: true, castleSide: 'q' });
      }
    }
  }
}

function addSlidingMoves(
  state: GameState,
  from: Square,
  moves: Move[],
  directions: Array<[number, number]>
) {
  const piece = getPiece(state.board, from);
  if (!piece) return;

  const f = fileOf(from);
  const r = rankOf(from);

  for (const [df, dr] of directions) {
    let nf = f + df;
    let nr = r + dr;
    while (isOnBoard(nf, nr)) {
      const to = makeSquare(nf, nr)!;
      const target = getPiece(state.board, to);
      if (!target) {
        pushMove(moves, from, to);
      } else {
        if (target.color !== piece.color) {
          pushMove(moves, from, to);
        }
        break; // blocked
      }
      nf += df;
      nr += dr;
    }
  }
}

function addBishopMoves(state: GameState, from: Square, moves: Move[]) {
  const piece = getPiece(state.board, from);
  if (!piece || piece.type !== 'b') return;
  addSlidingMoves(state, from, moves, [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ]);
}

function addRookMoves(state: GameState, from: Square, moves: Move[]) {
  const piece = getPiece(state.board, from);
  if (!piece || piece.type !== 'r') return;
  addSlidingMoves(state, from, moves, [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]);
}

function addQueenMoves(state: GameState, from: Square, moves: Move[]) {
  const piece = getPiece(state.board, from);
  if (!piece || piece.type !== 'q') return;
  addSlidingMoves(state, from, moves, [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ]);
}

function addMovesFromSquare(state: GameState, from: Square, moves: Move[]) {
  const piece = getPiece(state.board, from);
  if (!piece) return;
  if (piece.color !== state.sideToMove) return;

  switch (piece.type) {
    case 'p':
      addPawnMoves(state, from, moves);
      break;
    case 'n':
      addKnightMoves(state, from, moves);
      break;
    case 'b':
      addBishopMoves(state, from, moves);
      break;
    case 'r':
      addRookMoves(state, from, moves);
      break;
    case 'q':
      addQueenMoves(state, from, moves);
      break;
    case 'k':
      addKingMoves(state, from, moves);
      break;
  }
}

/**
 * Generates pseudo-legal moves for the current side to move.
 *
 * If `fromSquare` is provided, only moves from that square are generated.
 */
export function generatePseudoLegalMoves(state: GameState, fromSquare?: Square): Move[] {
  const moves: Move[] = [];
  if (typeof fromSquare === 'number') {
    addMovesFromSquare(state, fromSquare, moves);
    return moves;
  }

  for (let sq = 0; sq < 64; sq++) {
    addMovesFromSquare(state, sq, moves);
  }
  return moves;
}
