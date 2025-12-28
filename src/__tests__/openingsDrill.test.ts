import { describe, expect, it } from '@jest/globals';
import { tryParseFEN } from '../domain/notation/fen';
import { applyMove } from '../domain/applyMove';
import { uciToLegalMove, autoPlayOpponentReplies } from '../domain/training/openingsDrill';

describe('openingsDrill', () => {
  it('auto-plays opponent reply to return to user turn', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const parsed = tryParseFEN(fen);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const line = ['e2e4', 'e7e5', 'g1f3'];

    // user plays e2e4
    const m0 = uciToLegalMove(parsed.value, line[0]);
    expect(m0).not.toBeNull();
    if (!m0) return;
    const afterUser = applyMove(parsed.value, m0);
    expect(afterUser.sideToMove).toBe('b');

    const auto = autoPlayOpponentReplies(afterUser, line, 1, 'w');
    expect(auto.error).toBeUndefined();
    expect(auto.nextIndex).toBe(2);
    expect(auto.state.sideToMove).toBe('w');

    // next expected move for user (g1f3) should be legal now
    const m2 = uciToLegalMove(auto.state, line[2]);
    expect(m2).not.toBeNull();
  });
});
