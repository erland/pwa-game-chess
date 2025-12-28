import type { Move } from '../domain/chessTypes';
import { fromFEN } from '../domain/notation/fen';
import { evaluateTacticMove, getSolutionLines, isMoveInSolutions, progressTacticLine } from '../domain/training/tactics';
import type { TacticItem } from '../domain/training/schema';

describe('tactics helpers', () => {
  it('matches solutions by UCI (case-insensitive)', () => {
    expect(
      isMoveInSolutions('H7G7', null, [{ uci: 'h7g7', san: 'Qg7#' }])
    ).toBe(true);
  });

  it('supports multi-move solution lines (matches first move + exposes normalized lines)', () => {
    const item: TacticItem = {
      type: 'tactic',
      itemId: 't2',
      difficulty: 1,
      themes: ['demo'],
      position: { fen: '6k1/7Q/7K/8/8/8/8/8 w - - 0 1' },
      solutions: [{ lineUci: ['H7G7', 'g8h8'] }]
    };

    expect(isMoveInSolutions('h7g7', null, item.solutions)).toBe(true);
    expect(getSolutionLines(item)).toEqual([['h7g7', 'g8h8']]);
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

  it('progressTacticLine advances along a multi-ply line and auto-plays opponent replies', () => {
    const item: TacticItem = {
      type: 'tactic',
      itemId: 'm1',
      difficulty: 2,
      themes: ['mate-in-2'],
      // White: Kg6 Qe7 vs Black: Kg8. 1.Qf7+ Kh8 2.Qg7#
      position: { fen: '6k1/4Q3/6K1/8/8/8/8/8 w - - 0 1' },
      solutions: [{ lineUci: ['e7f7', 'g8h8', 'f7g7'] }]
    };

    const s0 = fromFEN(item.position.fen);

    // 1. Qf7+
    const m1: Move = { from: 52, to: 53 };
    const p1 = progressTacticLine(s0, m1, item, { userColor: 'w', activeLine: null, playedLineUci: [] });
    expect(p1.kind).toBe('continue');
    if (p1.kind !== 'continue') throw new Error('expected continue');
    expect(p1.playedLineUci).toEqual(['e7f7', 'g8h8']);
    expect(p1.ply).toBe(2);
    expect(p1.state.sideToMove).toBe('w');

    // 2. Qg7#
    const m2: Move = { from: 53, to: 54 };
    const p2 = progressTacticLine(p1.state, m2, item, { userColor: 'w', activeLine: p1.activeLine, playedLineUci: p1.playedLineUci });
    expect(p2.kind).toBe('complete');
    if (p2.kind !== 'complete') throw new Error('expected complete');
    expect(p2.playedLineUci).toEqual(['e7f7', 'g8h8', 'f7g7']);
    expect(p2.ply).toBe(3);
  });

  it('progressTacticLine detects wrong deviation after the first move (regression)', () => {
    const item: TacticItem = {
      type: 'tactic',
      itemId: 'm2',
      difficulty: 2,
      themes: ['mate-in-2'],
      position: { fen: '6k1/4Q3/6K1/8/8/8/8/8 w - - 0 1' },
      solutions: [{ lineUci: ['e7f7', 'g8h8', 'f7g7'] }]
    };

    const s0 = fromFEN(item.position.fen);
    const m1: Move = { from: 52, to: 53 };
    const p1 = progressTacticLine(s0, m1, item, { userColor: 'w', activeLine: null, playedLineUci: [] });
    if (p1.kind !== 'continue') throw new Error('expected continue');

    // Wrong: 2. Qf8??
    const wrong: Move = { from: 53, to: 61 };
    const p2 = progressTacticLine(p1.state, wrong, item, { userColor: 'w', activeLine: p1.activeLine, playedLineUci: p1.playedLineUci });
    expect(p2.kind).toBe('wrong');
    if (p2.kind !== 'wrong') throw new Error('expected wrong');
    expect(p2.playedLineUci).toEqual(['e7f7', 'g8h8', 'f7f8']);
  });

  it('progressTacticLine allows alternative acceptable first moves (locks to the chosen line)', () => {
    const item: TacticItem = {
      type: 'tactic',
      itemId: 'm3',
      difficulty: 2,
      themes: ['mate'],
      position: { fen: '6k1/4Q3/6K1/8/8/8/8/8 w - - 0 1' },
      solutions: [
        { lineUci: ['e7f7', 'g8h8', 'f7g7'] },
        { lineUci: ['e7e8'] } // immediate mate
      ]
    };

    const s0 = fromFEN(item.position.fen);
    const alt: Move = { from: 52, to: 60 }; // Qe8#
    const p = progressTacticLine(s0, alt, item, { userColor: 'w', activeLine: null, playedLineUci: [] });
    expect(p.kind).toBe('complete');
    if (p.kind !== 'complete') throw new Error('expected complete');
    expect(p.playedLineUci).toEqual(['e7e8']);
    expect(p.activeLine).toEqual(['e7e8']);
  });

  it('progressTacticLine reports packIllegal when a provided opponent reply is not legal', () => {
    const item: TacticItem = {
      type: 'tactic',
      itemId: 'm4',
      difficulty: 2,
      themes: ['demo'],
      position: { fen: '6k1/4Q3/6K1/8/8/8/8/8 w - - 0 1' },
      solutions: [{ lineUci: ['e7f7', 'g8g7', 'f7g7'] }]
    };

    const s0 = fromFEN(item.position.fen);
    const m1: Move = { from: 52, to: 53 };
    const p1 = progressTacticLine(s0, m1, item, { userColor: 'w', activeLine: null, playedLineUci: [] });
    expect(p1.kind).toBe('packIllegal');
  });
});
