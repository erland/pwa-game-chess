import type { Move, Piece, PieceType, Square } from '../chessTypes';
import type { AiConfig, AiMoveRequest, AiMoveResult, ChessAi } from './types';

import { generateLegalMoves } from '../legalMoves';
import { applyMove } from '../applyMove';
import { getGameStatus } from '../gameStatus';
import { isInCheck } from '../attack';
import { getPiece } from '../board';
import { fileOf, rankOf } from '../square';
import { oppositeColor } from '../chessTypes';

/**
 * v2 Step 3: Baseline bot with simple heuristics.
 *
 * Goals:
 * - Always returns a legal move when available.
 * - Fast (no worker required).
 * - Deterministic if config.seed is provided.
 */

type Rng = () => number; // 0..1

function abortIfNeeded(signal: AbortSignal): void {
  if (!signal.aborted) return;
  // Match what browsers/Jest typically use, but stay safe in non-DOM environments.
  const err =
    typeof DOMException !== 'undefined'
      ? new DOMException('Aborted', 'AbortError')
      : Object.assign(new Error('Aborted'), { name: 'AbortError' });
  throw err;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// Simple xorshift32 for deterministic tests.
function makeSeededRng(seed: number): Rng {
  let x = (seed | 0) || 123456789;
  return () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // Convert to [0,1)
    return ((x >>> 0) % 0x1_0000_0000) / 0x1_0000_0000;
  };
}

const PIECE_VALUE: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0
};

function promotionGain(p: Exclude<PieceType, 'k' | 'p'>): number {
  // Promoting replaces a pawn (1) with the chosen piece.
  return PIECE_VALUE[p] - PIECE_VALUE.p;
}

function capturedPieceForMove(state: AiMoveRequest['state'], move: Move, moving: Piece): Piece | null {
  // Normal capture.
  const direct = getPiece(state.board, move.to);
  if (direct) return direct;

  // En passant capture.
  if (move.isEnPassant && moving.type === 'p') {
    const toF = fileOf(move.to);
    const toR = rankOf(move.to);
    const capR = moving.color === 'w' ? toR - 1 : toR + 1;
    const capSq = (capR * 8 + toF) as Square;
    return getPiece(state.board, capSq);
  }

  return null;
}

function isCentralSquare(sq: Square): boolean {
  // d4,e4,d5,e5
  return sq === 27 || sq === 28 || sq === 35 || sq === 36;
}

function developsMinorPiece(from: Square, to: Square, moving: Piece): boolean {
  if (moving.type !== 'n' && moving.type !== 'b') return false;
  const rFrom = rankOf(from);
  // White minors start on rank 1 (index 0), black on rank 8 (index 7).
  if (moving.color === 'w' && rFrom !== 0) return false;
  if (moving.color === 'b' && rFrom !== 7) return false;
  // Consider it development if it leaves the back rank.
  return rankOf(to) !== rFrom;
}

function materialEval(state: AiMoveRequest['state'], aiColor: AiMoveRequest['aiColor']): number {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p) continue;
    const v = PIECE_VALUE[p.type];
    s += p.color === aiColor ? v : -v;
  }
  return s;
}

function defaultRandomnessForDifficulty(difficulty: AiConfig['difficulty']): number {
  switch (difficulty) {
    case 'easy':
      return 0.85;
    case 'medium':
      return 0.35;
    case 'hard':
      return 0.05;
    case 'custom':
    default:
      return 0.25;
  }
}

function defaultMaxDepthForDifficulty(difficulty: AiConfig['difficulty']): number {
  switch (difficulty) {
    case 'hard':
      return 2; // simple 1-ply lookahead (AI move + best opponent reply)
    default:
      return 1;
  }
}

type ScoredMove = { move: Move; score: number; meta?: { mateIn?: number } };

function chooseFromTop(scored: ScoredMove[], rng: Rng, randomness: number): ScoredMove {
  // Sort by score descending.
  const sorted = scored.slice().sort((a, b) => b.score - a.score);
  const n = sorted.length;
  if (n === 1) return sorted[0];

  const r = clamp01(randomness);
  // Pick uniformly among the top K moves; K increases with randomness.
  const maxK = Math.min(10, n);
  const k = Math.max(1, 1 + Math.floor(r * (maxK - 1)));
  const idx = Math.floor(rng() * k);
  return sorted[idx];
}

export class HeuristicBot implements ChessAi {
  async getMove(request: AiMoveRequest, signal: AbortSignal): Promise<AiMoveResult> {
    abortIfNeeded(signal);

    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const { state, aiColor } = request;
    const config = request.config;
    const randomness = clamp01(config.randomness ?? defaultRandomnessForDifficulty(config.difficulty));
    const maxDepth = Math.max(1, Math.floor(config.maxDepth ?? defaultMaxDepthForDifficulty(config.difficulty)));

    const rng: Rng =
      typeof config.seed === 'number' ? makeSeededRng(config.seed) : () => Math.random();

    const legal = generateLegalMoves(state);
    if (legal.length === 0) {
      // Shouldn't happen unless the game is over.
      throw new Error('No legal moves.');
    }

    const scored: ScoredMove[] = [];
    const enemy = oppositeColor(aiColor);

    for (let i = 0; i < legal.length; i++) {
      if ((i & 15) === 0) abortIfNeeded(signal);
      const move = legal[i];
      const moving = getPiece(state.board, move.from);
      if (!moving) continue;

      // Apply to evaluate tactical outcomes (check/mate) correctly.
      const next = applyMove(state, move);

      // Mate-in-1
      const st = getGameStatus(next);
      if (st.kind === 'checkmate' && st.winner === aiColor) {
        scored.push({ move, score: 1_000_000_000, meta: { mateIn: 1 } });
        continue;
      }

      let score = 0;

      // Checks
      if (isInCheck(next, enemy)) {
        score += 50_000;
      }

      // Promotions
      if (move.promotion) {
        score += 40_000 + promotionGain(move.promotion) * 10_000;
      }

      // Captures (by piece value)
      const captured = capturedPieceForMove(state, move, moving);
      if (captured) {
        score += PIECE_VALUE[captured.type] * 10_000;
      }

      // Development
      if (developsMinorPiece(move.from, move.to, moving)) {
        score += 300;
      }

      // Center control (very small)
      if (isCentralSquare(move.to)) {
        score += 200;
      }

      // Optional shallow lookahead for harder difficulty.
      if (maxDepth >= 2) {
        // Evaluate worst-case reply by opponent.
        const oppMoves = generateLegalMoves(next);
        let worst = Infinity;
        if (oppMoves.length === 0) {
          // Stalemate is not great; keep neutral.
          worst = materialEval(next, aiColor);
        } else {
          for (let j = 0; j < oppMoves.length; j++) {
            if ((j & 31) === 0) abortIfNeeded(signal);
            const next2 = applyMove(next, oppMoves[j]);
            const e = materialEval(next2, aiColor);
            if (e < worst) worst = e;
          }
        }
        // Scale to not dominate tactical heuristics.
        score += worst * 500;
      }

      scored.push({ move, score });
    }

    if (scored.length === 0) {
      // Defensive fallback.
      return { move: legal[0] };
    }

    const picked = chooseFromTop(scored, rng, randomness);
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

    return {
      move: picked.move,
      meta: {
        timeMs: Math.max(0, Math.round(t1 - t0)),
        depth: maxDepth,
        mateIn: picked.meta?.mateIn
      }
    };
  }
}
