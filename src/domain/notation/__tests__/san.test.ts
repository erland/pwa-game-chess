import { createInitialGameState } from '../../gameState';
import { applyMove } from '../../applyMove';
import { generateLegalMoves } from '../../legalMoves';
import { makeSquare } from '../../square';
import { toSAN } from '../san';
import type { GameState, Move } from '../../chessTypes';

function sq(a: string): number {
  const file = a.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(a[1]) - 1;
  const s = makeSquare(file as any, rank as any);
  if (s == null) throw new Error(`bad square ${a}`);
  return s;
}

function findMove(state: GameState, from: string, to: string, promotion?: any): Move {
  const fromSq = sq(from) as any;
  const toSq = sq(to) as any;
  const legal = generateLegalMoves(state, fromSq);
  const m = legal.find((x) => x.from === fromSq && x.to === toSq && x.promotion === promotion);
  if (!m) throw new Error(`move not found: ${from}${to}`);
  return m;
}

describe('toSAN', () => {
  it('formats basic pawn and piece moves', () => {
    let s = createInitialGameState();

    const e4 = findMove(s, 'e2', 'e4');
    expect(toSAN(s, e4)).toBe('e4');
    s = applyMove(s, e4);

    const e5 = findMove(s, 'e7', 'e5');
    expect(toSAN(s, e5)).toBe('e5');
    s = applyMove(s, e5);

    const nf3 = findMove(s, 'g1', 'f3');
    expect(toSAN(s, nf3)).toBe('Nf3');
  });

  it('formats captures (pawn capture)', () => {
    let s = createInitialGameState();

    const e4 = findMove(s, 'e2', 'e4');
    s = applyMove(s, e4);

    const d5 = findMove(s, 'd7', 'd5');
    s = applyMove(s, d5);

    const exd5 = findMove(s, 'e4', 'd5');
    expect(toSAN(s, exd5)).toBe('exd5');
  });

  it('formats castling', () => {
    let s = createInitialGameState();

    // 1. Nf3 Nf6
    const nf3 = findMove(s, 'g1', 'f3');
    s = applyMove(s, nf3);
    const nf6 = findMove(s, 'g8', 'f6');
    s = applyMove(s, nf6);

    // 2. g3 g6
    const g3 = findMove(s, 'g2', 'g3');
    s = applyMove(s, g3);
    const g6 = findMove(s, 'g7', 'g6');
    s = applyMove(s, g6);

    // 3. Bg2 Bg7
    const bg2 = findMove(s, 'f1', 'g2');
    s = applyMove(s, bg2);
    const bg7 = findMove(s, 'f8', 'g7');
    s = applyMove(s, bg7);

    // 4. O-O
    const oo = findMove(s, 'e1', 'g1');
    expect(toSAN(s, oo)).toBe('O-O');
  });
});
