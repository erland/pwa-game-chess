import type { Move, Square } from '../chessTypes';
import { parseAlgebraicSquare, toAlgebraic } from '../square';

/**
 * UCI move notation helpers.
 *
 * We use UCI strings inside engine/coach metadata because they are compact,
 * unambiguous, and easy to serialize across a Worker boundary.
 *
 * Examples:
 * - e2e4
 * - e7e8q (promotion)
 */

export function moveToUci(move: Move): string {
  const from = toAlgebraic(move.from);
  const to = toAlgebraic(move.to);
  const promo = move.promotion ? String(move.promotion).toLowerCase() : '';
  return `${from}${to}${promo}`;
}

export type ParsedUciMove = {
  from: Square;
  to: Square;
  promotion?: 'q' | 'r' | 'b' | 'n';
};

export function parseUciMove(text: string): ParsedUciMove | null {
  if (typeof text !== 'string') return null;
  const t = text.trim().toLowerCase();
  if (t.length !== 4 && t.length !== 5) return null;

  const from = parseAlgebraicSquare(t.slice(0, 2));
  const to = parseAlgebraicSquare(t.slice(2, 4));
  if (from === null || to === null) return null;

  let promotion: ParsedUciMove['promotion'] | undefined;
  if (t.length === 5) {
    const p = t[4];
    if (p === 'q' || p === 'r' || p === 'b' || p === 'n') promotion = p;
    else return null;
  }

  return { from, to, promotion };
}
