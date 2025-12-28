import { createInitialGameState } from '../../gameState';
import { fromFEN, toFEN } from '../fen';

describe('toFEN', () => {
  it('renders the starting position FEN', () => {
    const s = createInitialGameState();
    expect(toFEN(s)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });
});

describe('fromFEN', () => {
  it('parses the starting position', () => {
    const s = fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(s.sideToMove).toBe('w');
    expect(s.castling.wK).toBe(true);
    expect(s.castling.bQ).toBe(true);
    expect(s.enPassantTarget).toBe(null);
    expect(s.fullmoveNumber).toBe(1);
    expect(s.halfmoveClock).toBe(0);
    // Roundtrip
    expect(toFEN(s)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('parses a simple mate-in-1 tactic FEN (from the sample pack)', () => {
    const s = fromFEN('6k1/7Q/7K/8/8/8/8/8 w - - 0 1');
    expect(s.sideToMove).toBe('w');
    expect(toFEN(s)).toBe('6k1/7Q/7K/8/8/8/8/8 w - - 0 1');
  });
});
