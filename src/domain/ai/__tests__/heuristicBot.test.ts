import { HeuristicBot } from '../heuristicBot';

import type { GameState, Move, PieceType, Square } from '../../chessTypes';
import { createEmptyBoard } from '../../board';
import { parseAlgebraicSquare } from '../../square';
import { generateLegalMoves } from '../../legalMoves';

function sq(a: string): Square {
  const s = parseAlgebraicSquare(a);
  if (s === null) throw new Error(`Bad square: ${a}`);
  return s;
}

function makeState(
  pieces: Array<{ at: string; color: 'w' | 'b'; type: PieceType }>,
  sideToMove: 'w' | 'b'
): GameState {
  const board = createEmptyBoard();
  for (const p of pieces) {
    board[sq(p.at)] = { color: p.color, type: p.type };
  }
  return {
    board,
    sideToMove,
    castling: { wK: false, wQ: false, bK: false, bQ: false },
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    history: [],
    forcedStatus: null
  };
}

function movesEqual(a: Move, b: Move): boolean {
  return a.from === b.from && a.to === b.to && (a.promotion ?? null) === (b.promotion ?? null);
}

describe('HeuristicBot', () => {
  it('always returns a legal move when legal moves exist', async () => {
    const bot = new HeuristicBot();
    const state = makeState(
      [
        { at: 'e1', color: 'w', type: 'k' },
        { at: 'e8', color: 'b', type: 'k' },
        { at: 'd2', color: 'w', type: 'p' }
      ],
      'w'
    );

    const legal = generateLegalMoves(state);
    expect(legal.length).toBeGreaterThan(0);

    const res = await bot.getMove(
      { state, aiColor: 'w', config: { difficulty: 'easy', seed: 123, randomness: 0 } },
      new AbortController().signal
    );

    expect(legal.some((m) => movesEqual(m, res.move))).toBe(true);
  });

  it('prefers capturing a queen over a pawn (basic sanity)', async () => {
    const bot = new HeuristicBot();
    // White queen can capture either black queen (d5) or pawn (a4).
    const state = makeState(
      [
        { at: 'e1', color: 'w', type: 'k' },
        { at: 'd1', color: 'w', type: 'q' },
        { at: 'e8', color: 'b', type: 'k' },
        { at: 'd5', color: 'b', type: 'q' },
        { at: 'a4', color: 'b', type: 'p' }
      ],
      'w'
    );

    const res = await bot.getMove(
      { state, aiColor: 'w', config: { difficulty: 'hard', seed: 1, randomness: 0, maxDepth: 1 } },
      new AbortController().signal
    );

    expect(res.move.from).toBe(sq('d1'));
    expect(res.move.to).toBe(sq('d5'));
  });

  it('promotes when a promotion is available', async () => {
    const bot = new HeuristicBot();
    const state = makeState(
      [
        { at: 'e1', color: 'w', type: 'k' },
        { at: 'h8', color: 'b', type: 'k' },
        { at: 'a7', color: 'w', type: 'p' }
      ],
      'w'
    );

    const res = await bot.getMove(
      { state, aiColor: 'w', config: { difficulty: 'medium', seed: 7, randomness: 0 } },
      new AbortController().signal
    );

    expect(res.move.from).toBe(sq('a7'));
    expect(res.move.to).toBe(sq('a8'));
    expect(res.move.promotion).toBe('q');
  });
});
