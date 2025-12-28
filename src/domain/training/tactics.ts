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
    if (normalizeUci(s.uci) === pu) return true;
    if (ps && s.san && normalizeSan(s.san) === ps) return true;
  }
  return false;
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
