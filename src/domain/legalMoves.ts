import type { Board, Color, GameState, Move, Piece, Square } from './chessTypes';
import { oppositeColor } from './chessTypes';
import { getPiece as getPieceFromBoard, setPiece } from './board';
import { fileOf, makeSquare, rankOf } from './square';
import { isInCheck, isSquareAttacked } from './attack';
import { generatePseudoLegalMoves } from './movegen';

function cloneCastling(c: GameState['castling']): GameState['castling'] {
  return { wK: c.wK, wQ: c.wQ, bK: c.bK, bQ: c.bQ };
}

function applyMoveForValidation(state: GameState, move: Move): GameState {
  // Only mutate via new arrays/objects (pure)
  let board: Board = state.board.slice();
  const moving = getPieceFromBoard(board, move.from);
  if (!moving) return state;

  // Capture info (optional)
  let captured: Piece | null = getPieceFromBoard(board, move.to);

  // Clear from-square
  board = setPiece(board, move.from, null);

  // Handle castling (king move + rook move)
  if (move.isCastle) {
    const isWhite = moving.color === 'w';
    const homeRank = isWhite ? 0 : 7;

    // Place king on destination
    board = setPiece(board, move.to, moving);

    // Move rook
    if (move.castleSide === 'k') {
      const rookFrom = makeSquare(7, homeRank)!;
      const rookTo = makeSquare(5, homeRank)!;
      const rook = getPieceFromBoard(board, rookFrom);
      board = setPiece(board, rookFrom, null);
      if (rook) board = setPiece(board, rookTo, rook);
    } else if (move.castleSide === 'q') {
      const rookFrom = makeSquare(0, homeRank)!;
      const rookTo = makeSquare(3, homeRank)!;
      const rook = getPieceFromBoard(board, rookFrom);
      board = setPiece(board, rookFrom, null);
      if (rook) board = setPiece(board, rookTo, rook);
    }

    return {
      ...state,
      board,
      // Side to move flips so later steps can reuse this helper.
      sideToMove: oppositeColor(state.sideToMove),
      // Leave castling/enPassant as-is for Step 5 legality filtering;
      // Step 6 will properly maintain them.
      castling: cloneCastling(state.castling),
      enPassantTarget: state.enPassantTarget,
      halfmoveClock: state.halfmoveClock,
      fullmoveNumber: state.fullmoveNumber,
      history: state.history
    };
  }

  // En passant capture: captured pawn is not on `to`, but behind it.
  if (move.isEnPassant && moving.type === 'p') {
    const toF = fileOf(move.to);
    const toR = rankOf(move.to);
    const capR = moving.color === 'w' ? toR - 1 : toR + 1;
    const capSq = makeSquare(toF, capR);
    if (capSq !== null) {
      captured = getPieceFromBoard(board, capSq);
      board = setPiece(board, capSq, null);
    }
  }

  // Promotion
  if (moving.type === 'p' && typeof move.promotion !== 'undefined') {
    board = setPiece(board, move.to, { color: moving.color, type: move.promotion });
  } else {
    board = setPiece(board, move.to, moving);
  }

  return {
    ...state,
    board,
    sideToMove: oppositeColor(state.sideToMove),
    castling: cloneCastling(state.castling),
    enPassantTarget: state.enPassantTarget,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
    history: state.history
  };
}

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
