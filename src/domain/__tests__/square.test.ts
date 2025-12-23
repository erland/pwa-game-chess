import { makeSquare, parseAlgebraicSquare, toAlgebraic } from '../square';

describe('domain/square', () => {
  it('maps a1..h8 to 0..63 and back', () => {
    expect(makeSquare(0, 0)).toBe(0); // a1
    expect(makeSquare(7, 7)).toBe(63); // h8
    expect(toAlgebraic(0)).toBe('a1');
    expect(toAlgebraic(63)).toBe('h8');
  });

  it('parses algebraic squares', () => {
    expect(parseAlgebraicSquare('a1')).toBe(0);
    expect(parseAlgebraicSquare('H8')).toBe(63);
    expect(parseAlgebraicSquare('e4')).toBe(28); // e4 = file 4, rank 3 => 3*8+4=28

    expect(parseAlgebraicSquare('')).toBeNull();
    expect(parseAlgebraicSquare('i1')).toBeNull();
    expect(parseAlgebraicSquare('a9')).toBeNull();
    expect(parseAlgebraicSquare('a10')).toBeNull();
  });
});
