import { countPieces, createInitialGameState, createStartingBoard, getPiece, parseAlgebraicSquare } from '..';

describe('domain/starting position', () => {
  it('creates the correct starting position pieces', () => {
    const b = createStartingBoard();

    const a1 = parseAlgebraicSquare('a1')!;
    const e1 = parseAlgebraicSquare('e1')!;
    const d8 = parseAlgebraicSquare('d8')!;
    const e8 = parseAlgebraicSquare('e8')!;
    const a2 = parseAlgebraicSquare('a2')!;
    const h7 = parseAlgebraicSquare('h7')!;

    expect(getPiece(b, a1)).toEqual({ color: 'w', type: 'r' });
    expect(getPiece(b, e1)).toEqual({ color: 'w', type: 'k' });
    expect(getPiece(b, d8)).toEqual({ color: 'b', type: 'q' });
    expect(getPiece(b, e8)).toEqual({ color: 'b', type: 'k' });
    expect(getPiece(b, a2)).toEqual({ color: 'w', type: 'p' });
    expect(getPiece(b, h7)).toEqual({ color: 'b', type: 'p' });

    expect(countPieces(b)).toBe(32);
  });

  it('initial game state has correct defaults', () => {
    const s = createInitialGameState();
    expect(s.sideToMove).toBe('w');
    expect(s.castling).toEqual({ wK: true, wQ: true, bK: true, bQ: true });
    expect(s.enPassantTarget).toBeNull();
    expect(s.halfmoveClock).toBe(0);
    expect(s.fullmoveNumber).toBe(1);
    expect(s.history).toEqual([]);
  });
});
