import type { Board, CastlingRights, Color, GameState, Move, Piece, Square } from './chessTypes';
import { oppositeColor } from './chessTypes';
import { getPiece, setPiece } from './board';
import { fileOf, makeSquare, rankOf } from './square';

/**
 * Step 6: Apply a move and return the next state.
 *
 * Assumptions:
 * - The caller provides a legal move (typically from `generateLegalMoves`).
 * - The function is still defensive and will return the original state for invalid inputs.
 */

function cloneCastling(c: CastlingRights): CastlingRights {
  return { wK: c.wK, wQ: c.wQ, bK: c.bK, bQ: c.bQ };
}

function clearCastlingForColor(c: CastlingRights, color: Color): CastlingRights {
  const next = cloneCastling(c);
  if (color === 'w') {
    next.wK = false;
    next.wQ = false;
  } else {
    next.bK = false;
    next.bQ = false;
  }
  return next;
}

function disableRookCastlingIfFromHome(c: CastlingRights, color: Color, from: Square): CastlingRights {
  const next = cloneCastling(c);
  // White rooks: a1 (0) and h1 (7)
  // Black rooks: a8 (56) and h8 (63)
  if (color === 'w') {
    if (from === 0) next.wQ = false;
    if (from === 7) next.wK = false;
  } else {
    if (from === 56) next.bQ = false;
    if (from === 63) next.bK = false;
  }
  return next;
}

function disableRookCastlingIfCapturedOnHome(c: CastlingRights, captured: Piece | null, to: Square): CastlingRights {
  if (!captured || captured.type !== 'r') return c;
  const next = cloneCastling(c);

  if (captured.color === 'w') {
    if (to === 0) next.wQ = false;
    if (to === 7) next.wK = false;
  } else {
    if (to === 56) next.bQ = false;
    if (to === 63) next.bK = false;
  }
  return next;
}

function normalizeCastleFlags(state: GameState, move: Move, moving: Piece): Move {
  if (move.isCastle) return move;
  if (moving.type !== 'k') return move;
  const df = Math.abs(fileOf(move.to) - fileOf(move.from));
  if (df !== 2) return move;

  return {
    ...move,
    isCastle: true,
    castleSide: fileOf(move.to) > fileOf(move.from) ? 'k' : 'q'
  };
}

function normalizeEnPassantFlags(state: GameState, move: Move, moving: Piece, board: Board): Move {
  if (move.isEnPassant) return move;
  if (moving.type !== 'p') return move;

  const targetPiece = getPiece(board, move.to);
  if (targetPiece) return move; // normal capture or occupied square

  // Pawn moving diagonally onto an empty square that equals enPassantTarget.
  const df = Math.abs(fileOf(move.to) - fileOf(move.from));
  const dr = rankOf(move.to) - rankOf(move.from);
  const dir = moving.color === 'w' ? 1 : -1;
  if (df === 1 && dr === dir && state.enPassantTarget !== null && move.to === state.enPassantTarget) {
    return { ...move, isEnPassant: true };
  }
  return move;
}

function computeEnPassantTargetForDoublePush(moving: Piece, from: Square, to: Square): Square | null {
  if (moving.type !== 'p') return null;
  const df = fileOf(to) - fileOf(from);
  if (df !== 0) return null;
  const dr = rankOf(to) - rankOf(from);
  if (Math.abs(dr) !== 2) return null;
  const midRank = (rankOf(from) + rankOf(to)) / 2;
  const mid = makeSquare(fileOf(from), midRank);
  return mid;
}

function isPromotionMove(moving: Piece, to: Square): boolean {
  if (moving.type !== 'p') return false;
  const r = rankOf(to);
  return moving.color === 'w' ? r === 7 : r === 0;
}

export function applyMove(state: GameState, inputMove: Move): GameState {
  // If the game has been ended manually (resign/draw), ignore further moves.
  if (state.forcedStatus) return state;

  const moving = getPiece(state.board, inputMove.from);
  if (!moving) return state;
  if (moving.color !== state.sideToMove) return state;

  // Normalize flags so UI can pass simple moves later.
  let move = normalizeCastleFlags(state, inputMove, moving);
  move = normalizeEnPassantFlags(state, move, moving, state.board);

  let board: Board = state.board;
  let captured: Piece | null = getPiece(board, move.to);

  // Start from a cloned board (immutability)
  board = board.slice();

  // Clear from-square
  board = setPiece(board, move.from, null);

  // Castling: move king + rook
  if (move.isCastle && moving.type === 'k') {
    const isWhite = moving.color === 'w';
    const homeRank = isWhite ? 0 : 7;

    board = setPiece(board, move.to, moving);

    if (move.castleSide === 'k') {
      const rookFrom = makeSquare(7, homeRank)!;
      const rookTo = makeSquare(5, homeRank)!;
      const rook = getPiece(board, rookFrom);
      board = setPiece(board, rookFrom, null);
      if (rook) board = setPiece(board, rookTo, rook);
    } else {
      const rookFrom = makeSquare(0, homeRank)!;
      const rookTo = makeSquare(3, homeRank)!;
      const rook = getPiece(board, rookFrom);
      board = setPiece(board, rookFrom, null);
      if (rook) board = setPiece(board, rookTo, rook);
    }

    const nextCastling = clearCastlingForColor(state.castling, moving.color);
    const nextHistoryMove: Move = { ...move, captured: null };

    const nextSide = oppositeColor(state.sideToMove);
    const nextFullmove = state.sideToMove === 'b' ? state.fullmoveNumber + 1 : state.fullmoveNumber;
    const nextHalfmove = state.halfmoveClock + 1;

    return {
      ...state,
      board,
      sideToMove: nextSide,
      castling: nextCastling,
      enPassantTarget: null,
      halfmoveClock: nextHalfmove,
      fullmoveNumber: nextFullmove,
      history: [...state.history, nextHistoryMove]
    };
  }

  // En passant capture: captured pawn sits behind the target square.
  if (move.isEnPassant && moving.type === 'p') {
    const toF = fileOf(move.to);
    const toR = rankOf(move.to);
    const capR = moving.color === 'w' ? toR - 1 : toR + 1;
    const capSq = makeSquare(toF, capR);
    if (capSq !== null) {
      captured = getPiece(board, capSq);
      board = setPiece(board, capSq, null);
    }
  }

  // Place piece (promotion or normal)
  if (isPromotionMove(moving, move.to)) {
    // Per v1 plan: promotion must be explicitly provided when required.
    // (UI ensures this via the PromotionChooser; this is a defensive guard.)
    const promotion = move.promotion;
    if (!promotion) return state;
    board = setPiece(board, move.to, { color: moving.color, type: promotion });
    move = { ...move, promotion };
  } else {
    board = setPiece(board, move.to, moving);
  }

  // Castling rights updates
  let nextCastling = cloneCastling(state.castling);
  if (moving.type === 'k') {
    nextCastling = clearCastlingForColor(nextCastling, moving.color);
  } else if (moving.type === 'r') {
    nextCastling = disableRookCastlingIfFromHome(nextCastling, moving.color, move.from);
  }
  // If we captured an opponent rook on its home square, they lose the corresponding right.
  nextCastling = disableRookCastlingIfCapturedOnHome(nextCastling, captured, move.to);

  // En passant target update (only on pawn double push)
  const nextEnPassant = computeEnPassantTargetForDoublePush(moving, move.from, move.to);

  // Halfmove clock
  const isCapture = !!captured;
  const isPawnMove = moving.type === 'p';
  const nextHalfmove = isCapture || isPawnMove ? 0 : state.halfmoveClock + 1;

  // Fullmove number increments after black moves.
  const nextFullmove = state.sideToMove === 'b' ? state.fullmoveNumber + 1 : state.fullmoveNumber;

  const nextSide = oppositeColor(state.sideToMove);

  const nextHistoryMove: Move = { ...move, captured: captured ?? null };

  return {
    ...state,
    board,
    sideToMove: nextSide,
    castling: nextCastling,
    enPassantTarget: nextEnPassant,
    halfmoveClock: nextHalfmove,
    fullmoveNumber: nextFullmove,
    history: [...state.history, nextHistoryMove]
  };
}
