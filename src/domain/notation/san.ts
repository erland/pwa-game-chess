import type { GameState, Move, PieceType, Square } from '../chessTypes';
import { getPiece } from '../board';
import { fileOf, rankOf, toAlgebraic } from '../square';
import { generateLegalMoves } from '../legalMoves';
import { applyMove } from '../applyMove';
import { getGameStatus } from '../gameStatus';
import { isInCheck } from '../attack';

function pieceLetter(t: PieceType): string {
  switch (t) {
    case 'p': return '';
    case 'n': return 'N';
    case 'b': return 'B';
    case 'r': return 'R';
    case 'q': return 'Q';
    case 'k': return 'K';
  }
}

function isCastleMove(prev: GameState, move: Move): boolean {
  const moving = getPiece(prev.board, move.from);
  if (!moving || moving.type !== 'k') return false;
  const df = Math.abs(fileOf(move.to) - fileOf(move.from));
  return df === 2 && rankOf(move.to) === rankOf(move.from);
}

function castleSAN(move: Move): string {
  // When castling, king moves two squares.
  return fileOf(move.to) > fileOf(move.from) ? 'O-O' : 'O-O-O';
}

function isEnPassantMove(prev: GameState, move: Move): boolean {
  const moving = getPiece(prev.board, move.from);
  if (!moving || moving.type !== 'p') return false;
  const target = getPiece(prev.board, move.to);
  if (target) return false;
  const df = Math.abs(fileOf(move.to) - fileOf(move.from));
  const dr = rankOf(move.to) - rankOf(move.from);
  const dir = moving.color === 'w' ? 1 : -1;
  return df === 1 && dr === dir && prev.enPassantTarget !== null && move.to === prev.enPassantTarget;
}

function isCapture(prev: GameState, move: Move): boolean {
  const target = getPiece(prev.board, move.to);
  if (target) return true;
  return isEnPassantMove(prev, move);
}

function disambiguation(prev: GameState, move: Move, movingType: PieceType): string {
  // Only applies to pieces (not pawns) and non-castle.
  if (movingType === 'p') return '';
  if (isCastleMove(prev, move)) return '';

  const legal = generateLegalMoves(prev);
  const contenders = legal.filter((m) => {
    if (m.to !== move.to) return false;
    if (m.from === move.from) return false;
    const p = getPiece(prev.board, m.from);
    if (!p) return false;
    return p.type === movingType;
  });

  if (contenders.length === 0) return '';

  const myFile = fileOf(move.from);
  const myRank = rankOf(move.from);

  const sameFileExists = contenders.some((m) => fileOf(m.from) === myFile);
  const sameRankExists = contenders.some((m) => rankOf(m.from) === myRank);

  if (!sameFileExists) return toAlgebraic(move.from)[0]; // file only
  if (!sameRankExists) return toAlgebraic(move.from)[1]; // rank only
  return toAlgebraic(move.from); // file+rank
}

function promotionSuffix(move: Move): string {
  return move.promotion ? `=${move.promotion.toUpperCase()}` : '';
}

function checkSuffix(prev: GameState, move: Move): string {
  const next = applyMove(prev, move);
  if (next === prev) return '';

  const status = getGameStatus(next);
  if (status.kind === 'checkmate' && status.winner === prev.sideToMove) return '#';
  if (isInCheck(next, next.sideToMove)) return '+';
  return '';
}

/**
 * Convert a move to SAN (Standard Algebraic Notation) based on the position BEFORE the move.
 *
 * Notes:
 * - We intentionally do not include annotations like "!" / "?".
 * - We validate disambiguation by scanning legal moves from the position.
 */
export function toSAN(prev: GameState, move: Move): string {
  const moving = getPiece(prev.board, move.from);
  if (!moving) {
    // Fallback: coordinate notation
    return `${toAlgebraic(move.from)}${toAlgebraic(move.to)}${promotionSuffix(move)}`;
  }

  // Castling
  if (isCastleMove(prev, move) || move.isCastle) {
    return `${castleSAN(move)}${checkSuffix(prev, move)}`;
  }

  const capture = isCapture(prev, move) || Boolean(move.captured);

  // Pawn moves
  if (moving.type === 'p') {
    const dest = toAlgebraic(move.to);
    const fileChar = toAlgebraic(move.from)[0];
    const core = capture ? `${fileChar}x${dest}` : dest;
    return `${core}${promotionSuffix(move)}${checkSuffix(prev, move)}`;
  }

  // Piece moves
  const piece = pieceLetter(moving.type);
  const dis = disambiguation(prev, move, moving.type);
  const x = capture ? 'x' : '';
  const dest = toAlgebraic(move.to);

  return `${piece}${dis}${x}${dest}${promotionSuffix(move)}${checkSuffix(prev, move)}`;
}
