/**
 * Core chess domain types.
 *
 * Keep these types UI-agnostic and JSON-serializable.
 */

/** Color: white ('w') or black ('b'). */
export type Color = 'w' | 'b';

/**
 * Piece types are stored in lowercase, similar to FEN, but without color.
 * - p pawn
 * - n knight
 * - b bishop
 * - r rook
 * - q queen
 * - k king
 */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export type Piece = {
  color: Color;
  type: PieceType;
};

/**
 * 0–63 square index.
 *
 * Convention:
 * - 0 = a1
 * - 7 = h1
 * - 8 = a2
 * - 63 = h8
 */
export type Square = number;

export type CastlingRights = {
  /** White king-side (K). */
  wK: boolean;
  /** White queen-side (Q). */
  wQ: boolean;
  /** Black king-side (k). */
  bK: boolean;
  /** Black queen-side (q). */
  bQ: boolean;
};

/**
 * Move shape kept future-compatible.
 *
 * v1 will mainly use: from/to (+promotion).
 * Later steps can fill in flags during move generation and/or applyMove.
 */
export type Move = {
  from: Square;
  to: Square;
  /** Promotion piece type when the move promotes a pawn. */
  promotion?: Exclude<PieceType, 'k' | 'p'>;

  /** True for castling moves. */
  isCastle?: boolean;
  /** If isCastle, side is 'k' (king-side) or 'q' (queen-side). */
  castleSide?: 'k' | 'q';

  /** True for en passant captures. */
  isEnPassant?: boolean;

  /** Optional captured piece (may be filled by applyMove). */
  captured?: Piece | null;
};

/**
 * Game status/result for v1.
 *
 * Keep this serializable so later versions can persist and/or sync it.
 */
export type GameStatus =
  | { kind: 'inProgress' }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'drawInsufficientMaterial' }
  | { kind: 'drawAgreement' }
  | { kind: 'resign'; winner: Color; loser: Color }
  | { kind: 'timeout'; winner: Color; loser: Color };

export type Board = Array<Piece | null>;

export type GameState = {
  board: Board;
  sideToMove: Color;
  castling: CastlingRights;
  /** En passant target square, or null if none. */
  enPassantTarget: Square | null;
  /** Halfmove clock for the 50-move rule. */
  halfmoveClock: number;
  /** Fullmove number (starts at 1). */
  fullmoveNumber: number;
  /** Played moves (sufficient for later replay/review features). */
  history: Move[];

  /**
   * Optional forced game end (used for local resign / draw agreement in v1).
   * When set, the game is considered over.
   */
  forcedStatus: Exclude<GameStatus, { kind: 'inProgress' }> | null;
};

export function oppositeColor(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}
