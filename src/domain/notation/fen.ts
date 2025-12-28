import type { CastlingRights, Color, GameState, Piece } from '../chessTypes';
import { parseAlgebraicSquare, toAlgebraic } from '../square';

export type FenParseResult =
  | { ok: true; value: GameState }
  | { ok: false; error: string };

function pieceToFenChar(p: Piece): string {
  const c = p.type;
  return p.color === 'w' ? c.toUpperCase() : c;
}

/** Convert a GameState to a FEN string. */
export function toFEN(state: GameState): string {
  const ranks: string[] = [];

  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    let out = '';
    for (let f = 0; f < 8; f++) {
      const sq = r * 8 + f;
      const p = state.board[sq];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          out += String(empty);
          empty = 0;
        }
        out += pieceToFenChar(p);
      }
    }
    if (empty > 0) out += String(empty);
    ranks.push(out);
  }

  const placement = ranks.join('/');
  const active = state.sideToMove;

  let castling = '';
  if (state.castling.wK) castling += 'K';
  if (state.castling.wQ) castling += 'Q';
  if (state.castling.bK) castling += 'k';
  if (state.castling.bQ) castling += 'q';
  if (castling === '') castling = '-';

  const ep = state.enPassantTarget == null ? '-' : toAlgebraic(state.enPassantTarget);

  return `${placement} ${active} ${castling} ${ep} ${state.halfmoveClock} ${state.fullmoveNumber}`;
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function fenCharToPiece(ch: string): Piece | null {
  const lower = ch.toLowerCase();
  const color: Color = ch === lower ? 'b' : 'w';
  if (lower === 'p' || lower === 'n' || lower === 'b' || lower === 'r' || lower === 'q' || lower === 'k') {
    return { color, type: lower as Piece['type'] };
  }
  return null;
}

function defaultCastling(): CastlingRights {
  return { wK: false, wQ: false, bK: false, bQ: false };
}

/**
 * Parse a FEN string into a GameState.
 *
 * This is used by training packs (tactics/openings/endgames) to start from arbitrary positions.
 */
export function tryParseFEN(fen: string): FenParseResult {
  if (typeof fen !== 'string' || fen.trim().length === 0) return { ok: false, error: 'FEN must be a non-empty string' };

  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) return { ok: false, error: 'FEN must have at least 2 fields (placement + active color)' };

  const placement = parts[0];
  const active = parts[1];
  const castlingStr = parts[2] ?? '-';
  const epStr = parts[3] ?? '-';
  const halfStr = parts[4] ?? '0';
  const fullStr = parts[5] ?? '1';

  if (active !== 'w' && active !== 'b') return { ok: false, error: 'FEN active color must be "w" or "b"' };

  const ranks = placement.split('/');
  if (ranks.length !== 8) return { ok: false, error: 'FEN placement must have 8 ranks' };

  const board: GameState['board'] = new Array(64).fill(null);
  // FEN ranks go from 8 to 1; our squares are a1=0 .. h8=63.
  for (let r = 0; r < 8; r++) {
    const fenRank = ranks[r];
    let file = 0;
    for (let i = 0; i < fenRank.length; i++) {
      const ch = fenRank[i];
      if (isDigit(ch)) {
        const n = Number(ch);
        if (!Number.isFinite(n) || n < 1 || n > 8) return { ok: false, error: `Invalid digit in rank ${8 - r}` };
        file += n;
        if (file > 8) return { ok: false, error: `Too many squares in rank ${8 - r}` };
        continue;
      }

      const p = fenCharToPiece(ch);
      if (!p) return { ok: false, error: `Invalid piece char "${ch}" in rank ${8 - r}` };
      if (file >= 8) return { ok: false, error: `Too many squares in rank ${8 - r}` };
      const rankIndex = 7 - r; // 0..7 where 0 is rank1
      const sq = rankIndex * 8 + file;
      board[sq] = p;
      file++;
    }
    if (file !== 8) return { ok: false, error: `Rank ${8 - r} does not have 8 files` };
  }

  // Castling
  const castling = defaultCastling();
  if (castlingStr !== '-') {
    for (const ch of castlingStr) {
      if (ch === 'K') castling.wK = true;
      else if (ch === 'Q') castling.wQ = true;
      else if (ch === 'k') castling.bK = true;
      else if (ch === 'q') castling.bQ = true;
      else return { ok: false, error: `Invalid castling rights "${castlingStr}"` };
    }
  }

  // En passant
  let enPassantTarget: GameState['enPassantTarget'] = null;
  if (epStr !== '-') {
    const sq = parseAlgebraicSquare(epStr);
    if (sq == null) return { ok: false, error: `Invalid en passant target "${epStr}"` };
    enPassantTarget = sq;
  }

  const halfmoveClock = Number(halfStr);
  const fullmoveNumber = Number(fullStr);
  if (!Number.isFinite(halfmoveClock) || halfmoveClock < 0) return { ok: false, error: 'Invalid halfmove clock' };
  if (!Number.isFinite(fullmoveNumber) || fullmoveNumber < 1) return { ok: false, error: 'Invalid fullmove number' };

  const state: GameState = {
    board,
    sideToMove: active,
    castling,
    enPassantTarget,
    halfmoveClock: Math.floor(halfmoveClock),
    fullmoveNumber: Math.floor(fullmoveNumber),
    history: [],
    forcedStatus: null
  };

  return { ok: true, value: state };
}

export function fromFEN(fen: string): GameState {
  const r = tryParseFEN(fen);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

// Backwards-compatible alias used by tests/trainer pages.
export const parseFEN = tryParseFEN;
