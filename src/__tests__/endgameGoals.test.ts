import { describe, it, expect } from '@jest/globals';

import { tryParseFEN } from '../domain/notation/fen';
import { generateLegalMoves } from '../domain/legalMoves';
import { applyMove } from '../domain/applyMove';
import { parseEndgameGoal, checkEndgameGoal } from '../domain/training/endgameGoals';
import { moveToUci } from '../domain/notation/uci';

describe('endgameGoals', () => {
  it('parses common goal texts', () => {
    expect(parseEndgameGoal('Mate in 1').kind).toBe('mate');
    expect(parseEndgameGoal('Draw').kind).toBe('draw');
    expect(parseEndgameGoal('Promote a pawn').kind).toBe('promote');
    expect(parseEndgameGoal(null).kind).toBe('win');
  });

  it('detects mate goal success after checkmate', () => {
    const fen = '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1';
    const parsed = tryParseFEN(fen);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const state = parsed.value;
    const legal = generateLegalMoves(state);
    const mv = legal.find((m) => moveToUci(m) === 'g6g7');
    expect(mv).toBeTruthy();
    if (!mv) return;

    const next = applyMove(state, mv);
    const goal = parseEndgameGoal('Mate');
    const check = checkEndgameGoal(next, 'w', goal, mv, 'w');
    expect(check.done).toBe(true);
    expect(check.success).toBe(true);
    expect(check.status.kind).toBe('checkmate');
  });

  it('detects promote goal success on promotion move', () => {
    const fen = '8/P7/8/8/8/8/8/k6K w - - 0 1';
    const parsed = tryParseFEN(fen);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const state = parsed.value;
    const legal = generateLegalMoves(state);
    const promo = legal.find((m) => m.promotion && moveToUci(m).startsWith('a7a8'));
    expect(promo).toBeTruthy();
    if (!promo) return;

    const next = applyMove(state, promo);
    const goal = parseEndgameGoal('Promote');
    const check = checkEndgameGoal(next, 'w', goal, promo, 'w');
    expect(check.done).toBe(true);
    expect(check.success).toBe(true);
  });
});
