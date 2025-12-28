import { parseFEN, toFEN } from '../fen';
import { createInitialGameState } from '../../gameState';

describe('FEN parse', () => {
  it('round-trips the starting position', () => {
    const s = createInitialGameState();
    const fen = toFEN(s);
    const parsed = parseFEN(fen);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(toFEN(parsed.value)).toBe(fen);
    }
  });

  it('parses a simple position', () => {
    const parsed = parseFEN('6k1/7Q/7K/8/8/8/8/8 w - - 0 1');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.sideToMove).toBe('w');
    }
  });
});
