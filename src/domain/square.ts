import type { Square } from './chessTypes';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type FileIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type RankIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function isSquare(x: unknown): x is Square {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 64;
}

export function fileOf(square: Square): FileIndex {
  return (square % 8) as FileIndex;
}

export function rankOf(square: Square): RankIndex {
  return Math.floor(square / 8) as RankIndex;
}

export function makeSquare(file: number, rank: number): Square | null {
  if (!Number.isInteger(file) || !Number.isInteger(rank)) return null;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return (rank * 8 + file) as Square;
}

export function toAlgebraic(square: Square): string {
  const f = FILES[fileOf(square)];
  const r = (rankOf(square) + 1).toString();
  return `${f}${r}`;
}

export function parseAlgebraicSquare(text: string): Square | null {
  if (typeof text !== 'string') return null;
  const t = text.trim().toLowerCase();
  if (t.length !== 2) return null;

  const f = FILES.indexOf(t[0] as any);
  const r = Number(t[1]);
  if (f < 0) return null;
  if (!Number.isInteger(r) || r < 1 || r > 8) return null;
  return makeSquare(f, r - 1);
}

/**
 * Mirrors a square vertically (rank flip).
 * Useful for board orientation mapping in the UI.
 */
export function mirrorRank(square: Square): Square {
  const f = fileOf(square);
  const r = rankOf(square);
  return ((7 - r) * 8 + f) as Square;
}

/**
 * Mirrors a square horizontally (file flip).
 * Useful for board orientation mapping in the UI.
 */
export function mirrorFile(square: Square): Square {
  const f = fileOf(square);
  const r = rankOf(square);
  return (r * 8 + (7 - f)) as Square;
}
