import { createInitialGameState } from '../../gameState';
import { toFEN } from '../fen';

describe('toFEN', () => {
  it('renders the starting position FEN', () => {
    const s = createInitialGameState();
    expect(toFEN(s)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });
});
