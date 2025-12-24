import type { Color, GameState, Move, PieceType, Square } from '../chessTypes';
import { oppositeColor } from '../chessTypes';
import { generateLegalMoves } from '../legalMoves';
import { applyMoveForValidation } from '../applyMove';
import { getPiece } from '../board';
import { fileOf, rankOf } from '../square';
import { isInCheck } from '../attack';

import type { AiConfig, AiMoveMetadata } from './types';

/**
 * v2 Step 7: "Strong engine" search.
 *
 * This is a compact alpha-beta search intended to run in a Web Worker.
 * It is not Stockfish, but it's substantially stronger than the baseline heuristic bot.
 */

export type StrongSearchEnv = {
  nowMs: () => number;
  shouldAbort: () => boolean;
};

const PIECE_VALUE_CP: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0
};

// Very small piece-square tables (centipawns), from White's perspective.
// These are deliberately light-weight; depth + alpha-beta is the main strength gain.
const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  10, 10, 10, -10, -10, 10, 10, 10,
  6, 6, 8, 12, 12, 8, 6, 6,
  4, 4, 6, 10, 10, 6, 4, 4,
  2, 2, 4, 8, 8, 4, 2, 2,
  1, 1, 2, 4, 4, 2, 1, 1,
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0
];

const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50
];

const PST_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20
];

const PST_ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0
];

const PST_QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20
];

const PST_KING = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20
];

function mirrorForBlack(sq: Square): Square {
  const f = fileOf(sq);
  const r = rankOf(sq);
  return ((7 - r) * 8 + f) as Square;
}

function pstValue(type: PieceType, sq: Square, color: Color): number {
  const idx = color === 'w' ? sq : mirrorForBlack(sq);
  switch (type) {
    case 'p':
      return PST_PAWN[idx] ?? 0;
    case 'n':
      return PST_KNIGHT[idx] ?? 0;
    case 'b':
      return PST_BISHOP[idx] ?? 0;
    case 'r':
      return PST_ROOK[idx] ?? 0;
    case 'q':
      return PST_QUEEN[idx] ?? 0;
    case 'k':
      return PST_KING[idx] ?? 0;
    default:
      return 0;
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

type Rng = () => number;

function makeSeededRng(seed: number): Rng {
  let x = (seed | 0) || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 0x1_0000_0000) / 0x1_0000_0000;
  };
}

function evaluateCp(state: GameState, aiColor: Color): number {
  let cp = 0;
  for (let sq = 0 as Square; sq < 64; sq = (sq + 1) as Square) {
    const p = state.board[sq];
    if (!p) continue;
    const v = PIECE_VALUE_CP[p.type] + pstValue(p.type, sq, p.color);
    cp += p.color === aiColor ? v : -v;
  }

  // Small mobility term (encourages development), capped so it doesn't dominate.
  const moves = generateLegalMoves(state);
  const mob = Math.min(30, moves.length);
  cp += state.sideToMove === aiColor ? mob * 2 : -mob * 2;

  return cp;
}

function moveOrderScore(state: GameState, move: Move): number {
  const moving = getPiece(state.board, move.from);
  const captured = getPiece(state.board, move.to);

  let s = 0;
  if (captured) {
    // MVV/LVA-ish ordering.
    s += (PIECE_VALUE_CP[captured.type] ?? 0) * 10;
    s -= (moving ? PIECE_VALUE_CP[moving.type] ?? 0 : 0);
  }
  if (move.promotion) {
    s += 9_000;
  }
  if (move.isCastle) {
    s += 500;
  }
  return s;
}

type SearchResult = {
  bestMove: Move;
  scoreCp: number;
  depth: number;
  nodes: number;
  mateIn?: number;
};

function alphabeta(
  env: StrongSearchEnv,
  state: GameState,
  aiColor: Color,
  depth: number,
  alpha: number,
  beta: number,
  nodesRef: { n: number },
  plyFromRoot: number
): { score: number; mateIn?: number } {
  if (env.shouldAbort()) throw new Error('ABORT');

  const forced = state.forcedStatus;
  if (forced) {
    if (forced.kind === 'resign' || forced.kind === 'timeout') {
      const win = forced.winner;
      const score = win === aiColor ? 1_000_000 : -1_000_000;
      return { score };
    }
    // draws
    return { score: 0 };
  }

  if (depth <= 0) {
    nodesRef.n += 1;
    return { score: evaluateCp(state, aiColor) };
  }

  const moves = generateLegalMoves(state);
  if (moves.length === 0) {
    nodesRef.n += 1;
    // No legal moves -> checkmate or stalemate.
    const inCheck = isInCheck(state, state.sideToMove);
    if (!inCheck) return { score: 0 };
    const winner = oppositeColor(state.sideToMove);
    // Mate: prefer quicker mates and avoid getting mated.
    const mateScore = winner === aiColor ? 900_000 - plyFromRoot : -900_000 + plyFromRoot;
    return { score: mateScore, mateIn: 1 };
  }

  // Move ordering (helps alpha-beta significantly).
  const ordered = moves
    .slice()
    .sort((a, b) => moveOrderScore(state, b) - moveOrderScore(state, a));

  const maximizing = state.sideToMove === aiColor;
  let bestMateIn: number | undefined = undefined;

  if (maximizing) {
    let best = -Infinity;
    for (let i = 0; i < ordered.length; i++) {
      if ((i & 31) === 0 && env.shouldAbort()) throw new Error('ABORT');
      const next = applyMoveForValidation(state, ordered[i]);
      const r = alphabeta(env, next, aiColor, depth - 1, alpha, beta, nodesRef, plyFromRoot + 1);
      if (r.score > best) {
        best = r.score;
        bestMateIn = r.mateIn;
      }
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return { score: best, mateIn: bestMateIn };
  }

  let best = Infinity;
  for (let i = 0; i < ordered.length; i++) {
    if ((i & 31) === 0 && env.shouldAbort()) throw new Error('ABORT');
    const next = applyMoveForValidation(state, ordered[i]);
    const r = alphabeta(env, next, aiColor, depth - 1, alpha, beta, nodesRef, plyFromRoot + 1);
    if (r.score < best) {
      best = r.score;
      bestMateIn = r.mateIn;
    }
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return { score: best, mateIn: bestMateIn };
}

function pickFromTop(scored: Array<{ move: Move; score: number }>, rng: Rng, randomness: number): { move: Move; score: number } {
  const sorted = scored.slice().sort((a, b) => b.score - a.score);
  if (sorted.length === 1) return sorted[0];
  const r = clamp01(randomness);
  const maxK = Math.min(8, sorted.length);
  const k = Math.max(1, 1 + Math.floor(r * (maxK - 1)));
  const idx = Math.floor(rng() * k);
  return sorted[idx];
}

export function findBestMoveStrong(
  env: StrongSearchEnv,
  request: { state: GameState; aiColor: Color; config: AiConfig }
): { move: Move; meta: AiMoveMetadata } {
  const { state, aiColor, config } = request;

  const maxDepth = Math.max(1, Math.floor(config.maxDepth ?? (config.difficulty === 'hard' ? 4 : 2)));
  const thinkTimeMs = Math.max(0, Math.floor(config.thinkTimeMs ?? 0));
  const deadline = thinkTimeMs > 0 ? env.nowMs() + thinkTimeMs : null;

  const env2: StrongSearchEnv = {
    nowMs: env.nowMs,
    shouldAbort: () => env.shouldAbort() || (deadline !== null && env.nowMs() >= deadline)
  };

  const rng: Rng = typeof config.seed === 'number' ? makeSeededRng(config.seed) : () => Math.random();
  const randomness = clamp01(config.randomness ?? (config.difficulty === 'easy' ? 0.7 : config.difficulty === 'medium' ? 0.25 : 0.05));

  const legalRoot = generateLegalMoves(state);
  if (legalRoot.length === 0) {
    throw new Error('No legal moves');
  }

  const t0 = env.nowMs();

  let best: SearchResult | null = null;

  // Iterative deepening: keep the best move from the deepest fully-computed iteration.
  for (let depth = 1; depth <= maxDepth; depth++) {
    const nodesRef = { n: 0 };
    const scored: Array<{ move: Move; score: number; mateIn?: number }> = [];

    // Order root moves too.
    const ordered = legalRoot
      .slice()
      .sort((a, b) => moveOrderScore(state, b) - moveOrderScore(state, a));

    try {
      for (let i = 0; i < ordered.length; i++) {
        if ((i & 15) === 0 && env2.shouldAbort()) throw new Error('ABORT');
        const m = ordered[i];
        const next = applyMoveForValidation(state, m);
        const r = alphabeta(env2, next, aiColor, depth - 1, -Infinity, Infinity, nodesRef, 1);
        scored.push({ move: m, score: r.score, mateIn: r.mateIn });
      }
    } catch (e) {
      // Budget exceeded or aborted mid-iteration: keep previous completed depth.
      break;
    }

    if (scored.length === 0) break;

    const picked = pickFromTop(
      scored.map((s) => ({ move: s.move, score: s.score })),
      rng,
      randomness
    );
    const top = scored.find((s) => s.move === picked.move);

    best = {
      bestMove: picked.move,
      scoreCp: picked.score,
      depth,
      nodes: nodesRef.n,
      mateIn: top?.mateIn
    };

    // If we found a forced mate score, no need to search deeper.
    if (Math.abs(picked.score) >= 850_000) break;
  }

  const t1 = env.nowMs();
  const final = best ?? {
    bestMove: legalRoot[0],
    scoreCp: 0,
    depth: 1,
    nodes: 0
  };

  return {
    move: final.bestMove,
    meta: {
      timeMs: Math.max(0, Math.round(t1 - t0)),
      depth: final.depth,
      nodes: final.nodes,
      scoreCp: final.scoreCp,
      mateIn: final.mateIn
    }
  };
}
