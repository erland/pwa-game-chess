import type { Color, GameState, Move } from '../chessTypes';
import { generateLegalMoves } from '../legalMoves';
import { applyMove } from '../applyMove';
import { parseUciMove } from '../notation/uci';

/** Normalize a UCI string (lowercase + trim). */
export function normalizeUci(uci: string): string {
  return String(uci ?? '').trim().toLowerCase();
}

/**
 * Convert a UCI string into a legal Move for the given state (if possible).
 * Returns null if the UCI is invalid or not legal in the position.
 */
export function uciToLegalMove(state: GameState, uci: string): Move | null {
  const parsed = parseUciMove(uci);
  if (!parsed) return null;

  const candidates = generateLegalMoves(state, parsed.from).filter((m) => m.to === parsed.to);
  if (candidates.length === 0) return null;

  if (parsed.promotion) {
    const p = parsed.promotion;
    const promo = candidates.find((m) => String(m.promotion).toLowerCase() === p);
    return promo ?? null;
  }

  // Prefer non-promotion move if UCI doesn't include a promotion suffix.
  const nonPromo = candidates.find((m) => !m.promotion);
  return nonPromo ?? candidates[0] ?? null;
}

export type ApplyUciResult =
  | { ok: true; state: GameState; move: Move }
  | { ok: false; error: string };

export function applyForcedUciMove(state: GameState, uci: string): ApplyUciResult {
  const legal = uciToLegalMove(state, uci);
  if (!legal) return { ok: false, error: `Expected move is not legal here: ${uci}` };
  return { ok: true, state: applyMove(state, legal), move: legal };
}

/**
 * Auto-play forced opponent replies from a line until it is `userColor` to move again,
 * or until the line is exhausted.
 */
export function autoPlayOpponentReplies(
  state: GameState,
  lineUci: string[],
  startIndex: number,
  userColor: Color
): { state: GameState; nextIndex: number; error?: string } {
  let s = state;
  let i = startIndex;

  while (i < lineUci.length && s.sideToMove !== userColor) {
    const uci = lineUci[i];
    const r = applyForcedUciMove(s, uci);
    if (!r.ok) return { state: s, nextIndex: i, error: r.error };
    s = r.state;
    i += 1;
  }

  return { state: s, nextIndex: i };
}

/** True if the next expected move in the line is a move by userColor. */
export function isUsersTurnInLine(state: GameState, userColor: Color): boolean {
  return state.sideToMove === userColor;
}

/** Basic UCI detector (used for opening pack lines). */
export function isUciLike(moveText: string): boolean {
  const t = normalizeUci(moveText);
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t);
}
