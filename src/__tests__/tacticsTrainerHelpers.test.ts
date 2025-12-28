import type { Move } from '../domain/chessTypes';
import { fromFEN } from '../domain/notation/fen';
import { evaluateTacticMove, isMoveInSolutions } from '../domain/training/tactics';
import type { TacticItem } from '../domain/training/schema';

describe('tactics helpers', () => {
  it('matches solutions by UCI (case-insensitive)', () => {
    expect(
      isMoveInSolutions('H7G7', null, [{ uci: 'h7g7', san: 'Qg7#' }])
    ).toBe(true);
  });

  it('evaluateTacticMove marks correct move for the starter pack tactic', () => {
    const item: TacticItem = {
      type: 'tactic',
      itemId: 't1',
      difficulty: 1,
      themes: ['mate-in-1'],
      position: { fen: '6k1/7Q/7K/8/8/8/8/8 w - - 0 1' },
      goal: 'Mate in 1',
      solutions: [{ uci: 'h7g7', san: 'Qg7#' }]
    };

    const state = fromFEN(item.position.fen);
    const move: Move = { from: 55, to: 54 }; // h7->g7

    const res = evaluateTacticMove(state, move, item);
    expect(res.playedUci).toBe('h7g7');
    expect(res.isCorrect).toBe(true);
  });
});
