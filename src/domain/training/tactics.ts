import type { GameState, Move } from '../chessTypes';
import type { TacticItem, TacticSolution } from './schema';
import { moveToUci } from '../notation/uci';
import { toSAN } from '../notation/san';

export function normalizeUci(uci: string): string {
  return (uci || '').trim().toLowerCase();
}

export function normalizeSan(san: string): string {
  return (san || '').trim().replace(/\s+/g, '').toLowerCase();
}

export function isMoveInSolutions(
  playedUci: string,
  playedSan: string | null,
  solutions: TacticSolution[]
): boolean {
  const pu = normalizeUci(playedUci);
  const ps = playedSan ? normalizeSan(playedSan) : null;

  for (const s of solutions) {
    // v1 packs: compare against single uci.
    if (typeof s.uci === 'string' && normalizeUci(s.uci) === pu) return true;

    // v2 packs: compare against the first move in the line.
    if (Array.isArray(s.lineUci) && s.lineUci.length > 0 && normalizeUci(s.lineUci[0]) === pu) return true;

    if (ps && s.san && normalizeSan(s.san) === ps) return true;
  }
  return false;
}

/** Normalize all solution lines to arrays of UCI strings (lowercased/trimmed). */
export function getSolutionLines(item: TacticItem): string[][] {
  const out: string[][] = [];
  for (const s of item.solutions) {
    const line = Array.isArray(s.lineUci) && s.lineUci.length > 0
      ? s.lineUci
      : typeof s.uci === 'string'
        ? [s.uci]
        : [];
    if (line.length > 0) out.push(line.map((x) => normalizeUci(x)));
  }
  return out;
}

export function evaluateTacticMove(
  prevState: GameState,
  move: Move,
  item: TacticItem
): { playedUci: string; playedSan: string; isCorrect: boolean } {
  const playedUci = moveToUci(move);
  const playedSan = toSAN(prevState, move);
  return {
    playedUci,
    playedSan,
    isCorrect: isMoveInSolutions(playedUci, playedSan, item.solutions)
  };
}
