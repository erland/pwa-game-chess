import type { Color, GameState, Move, Square } from '../chessTypes';
import type { TacticItem, TacticSolution } from './schema';
import { applyMove } from '../applyMove';
import { generateLegalMoves } from '../legalMoves';
import { moveToUci, parseUciMove } from '../notation/uci';
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

function startsWithPrefix(line: string[], prefix: string[]): boolean {
  if (prefix.length > line.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (line[i] !== prefix[i]) return false;
  }
  return true;
}

/**
 * Convert a (normalized) UCI string to a legal move in the given state, or null.
 *
 * This is intentionally "pure": it deterministically inspects the state and returns a Move.
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

export type TacticLineProgressState = {
  /** The player's color (side-to-move at the starting FEN). */
  userColor: Color;
  /** Locked solution line once disambiguated; null means "still flexible". */
  activeLine: string[] | null;
  /** Line played so far (includes auto-played opponent replies). */
  playedLineUci: string[];
};

export type TacticLineProgressOutcome =
  | {
      kind: 'wrong';
      playedUci: string;
      playedSan: string;
      state: GameState;
      activeLine: string[] | null;
      ply: number;
      playedLineUci: string[];
      lastMove: { from: Square; to: Square };
    }
  | {
      kind: 'packIllegal';
      message: string;
      playedUci: string;
      playedSan: string;
      state: GameState;
      activeLine: string[];
      ply: number;
      playedLineUci: string[];
      lastMove: { from: Square; to: Square };
    }
  | {
      kind: 'continue' | 'complete';
      playedUci: string;
      playedSan: string;
      state: GameState;
      activeLine: string[];
      ply: number;
      playedLineUci: string[];
      autoPlayedUci: string[];
      lastMove: { from: Square; to: Square };
    };

/**
 * Progress a tactics attempt by applying the user's move and then auto-playing any expected opponent replies.
 *
 * This implements multi-ply solution lines and supports alternative acceptable lines.
 *
 * Rules:
 * - While activeLine is null, the attempt remains "flexible": any solution line consistent with playedLineUci
 *   is acceptable, and the user's next move must match at least one such line at the current ply.
 * - Once a move disambiguates (or we must auto-play an opponent reply), we lock to a single activeLine.
 */
export function progressTacticLine(
  prevState: GameState,
  userMove: Move,
  item: TacticItem,
  prev: TacticLineProgressState
): TacticLineProgressOutcome {
  const solutionLines = getSolutionLines(item);
  const playedUci = normalizeUci(moveToUci(userMove));
  const playedSan = toSAN(prevState, userMove);

  // Canonical ply is the number of moves played so far (including auto replies).
  const basePlayed = (prev.playedLineUci ?? []).map(normalizeUci);
  const ply = basePlayed.length;

  // Candidate lines must match the already-played prefix.
  const candidates = (prev.activeLine ? [prev.activeLine] : solutionLines).filter((l) => startsWithPrefix(l, basePlayed));
  const matching = candidates.filter((l) => l.length > ply && l[ply] === playedUci);

  // Apply the user's move so the board reflects what they played, even if it was wrong.
  const afterUser = applyMove(prevState, userMove);
  const afterPlayed = [...basePlayed, playedUci];
  const lastAfterUser = { from: userMove.from, to: userMove.to };

  if (matching.length === 0) {
    return {
      kind: 'wrong',
      playedUci,
      playedSan,
      state: afterUser,
      activeLine: prev.activeLine,
      ply: afterPlayed.length,
      playedLineUci: afterPlayed,
      lastMove: lastAfterUser
    };
  }

  // If we already had an active line, it must match.
  // Otherwise: lock to a single line once we need determinism (either unique match, or we must auto-play).
  let activeLine: string[] = prev.activeLine ?? matching[0];
  if (!prev.activeLine) {
    if (matching.length === 1) {
      activeLine = matching[0];
    } else {
      // Prefer the shortest matching line; tie-break lexicographically for determinism.
      const sorted = [...matching].sort((a, b) => (a.length - b.length) || a.join(' ').localeCompare(b.join(' ')));
      activeLine = sorted[0];
    }
  }

  // If the line ends on the user's move, it's complete.
  let nextState = afterUser;
  let nextPlayed = afterPlayed;
  let nextPly = nextPlayed.length;
  let lastMove = lastAfterUser;
  const autoPlayedUci: string[] = [];

  // Auto-play expected opponent moves until it's user's turn again or line ends.
  while (nextPly < activeLine.length && nextState.sideToMove !== prev.userColor) {
    const expectedUci = activeLine[nextPly];
    const om = uciToLegalMove(nextState, expectedUci);
    if (!om) {
      return {
        kind: 'packIllegal',
        message: `Pack line contains an illegal move at ply ${nextPly + 1}: ${expectedUci}`,
        playedUci,
        playedSan,
        state: nextState,
        activeLine,
        ply: nextPlayed.length,
        playedLineUci: nextPlayed,
        lastMove
      };
    }
    nextState = applyMove(nextState, om);
    autoPlayedUci.push(normalizeUci(expectedUci));
    nextPlayed = [...nextPlayed, normalizeUci(expectedUci)];
    lastMove = { from: om.from, to: om.to };
    nextPly++;
  }

  const complete = nextPly >= activeLine.length;
  return {
    kind: complete ? 'complete' : 'continue',
    playedUci,
    playedSan,
    state: nextState,
    activeLine,
    ply: nextPly,
    playedLineUci: nextPlayed,
    autoPlayedUci,
    lastMove
  };
}
