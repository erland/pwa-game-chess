import {
  createEmptyBoard,
  getGameStatus,
  parseAlgebraicSquare,
  setPiece
} from '../index';
import type { GameState, Piece } from '../chessTypes';

function piece(color: 'w' | 'b', type: Piece['type']): Piece {
  return { color, type };
}

function mkState(partial: Partial<GameState>): GameState {
  return {
    board: createEmptyBoard(),
    sideToMove: 'w',
    castling: { wK: false, wQ: false, bK: false, bQ: false },
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    history: [],
    forcedStatus: null,
    ...partial
  };
}

describe('Step 7 — game end detection (v1 minimum set)', () => {
  it('detects checkmate (KQ vs K)', () => {
    const f6 = parseAlgebraicSquare('f6')!;
    const g7 = parseAlgebraicSquare('g7')!;
    const h8 = parseAlgebraicSquare('h8')!;

    let b = createEmptyBoard();
    b = setPiece(b, f6, piece('w', 'k'));
    b = setPiece(b, g7, piece('w', 'q'));
    b = setPiece(b, h8, piece('b', 'k'));

    const s = mkState({ board: b, sideToMove: 'b' });
    expect(getGameStatus(s)).toEqual({ kind: 'checkmate', winner: 'w' });
  });

  it('detects stalemate (KQ vs K)', () => {
    const f7 = parseAlgebraicSquare('f7')!;
    const g6 = parseAlgebraicSquare('g6')!;
    const h8 = parseAlgebraicSquare('h8')!;

    let b = createEmptyBoard();
    b = setPiece(b, f7, piece('w', 'k'));
    b = setPiece(b, g6, piece('w', 'q'));
    b = setPiece(b, h8, piece('b', 'k'));

    const s = mkState({ board: b, sideToMove: 'b' });
    expect(getGameStatus(s)).toEqual({ kind: 'stalemate' });
  });

  it('draw: K vs K', () => {
    const e1 = parseAlgebraicSquare('e1')!;
    const e8 = parseAlgebraicSquare('e8')!;
    let b = createEmptyBoard();
    b = setPiece(b, e1, piece('w', 'k'));
    b = setPiece(b, e8, piece('b', 'k'));

    const s = mkState({ board: b, sideToMove: 'w' });
    expect(getGameStatus(s)).toEqual({ kind: 'drawInsufficientMaterial' });
  });

  it('draw: K+N vs K', () => {
    const e1 = parseAlgebraicSquare('e1')!;
    const e8 = parseAlgebraicSquare('e8')!;
    const b1 = parseAlgebraicSquare('b1')!;
    let b = createEmptyBoard();
    b = setPiece(b, e1, piece('w', 'k'));
    b = setPiece(b, b1, piece('w', 'n'));
    b = setPiece(b, e8, piece('b', 'k'));

    const s = mkState({ board: b, sideToMove: 'w' });
    expect(getGameStatus(s)).toEqual({ kind: 'drawInsufficientMaterial' });
  });

  it('draw: K+B vs K', () => {
    const e1 = parseAlgebraicSquare('e1')!;
    const e8 = parseAlgebraicSquare('e8')!;
    const c1 = parseAlgebraicSquare('c1')!;
    let b = createEmptyBoard();
    b = setPiece(b, e1, piece('w', 'k'));
    b = setPiece(b, c1, piece('w', 'b'));
    b = setPiece(b, e8, piece('b', 'k'));

    const s = mkState({ board: b, sideToMove: 'w' });
    expect(getGameStatus(s)).toEqual({ kind: 'drawInsufficientMaterial' });
  });

  it('draw: K+B vs K+B when bishops are on the same color squares', () => {
    const e1 = parseAlgebraicSquare('e1')!;
    const e8 = parseAlgebraicSquare('e8')!;
    const c1 = parseAlgebraicSquare('c1')!; // dark
    const f8 = parseAlgebraicSquare('f8')!; // dark
    let b = createEmptyBoard();
    b = setPiece(b, e1, piece('w', 'k'));
    b = setPiece(b, c1, piece('w', 'b'));
    b = setPiece(b, e8, piece('b', 'k'));
    b = setPiece(b, f8, piece('b', 'b'));

    const s = mkState({ board: b, sideToMove: 'w' });
    expect(getGameStatus(s)).toEqual({ kind: 'drawInsufficientMaterial' });
  });

  it('does not declare insufficient material for opposite-colored bishops', () => {
    const e1 = parseAlgebraicSquare('e1')!;
    const e8 = parseAlgebraicSquare('e8')!;
    const c1 = parseAlgebraicSquare('c1')!; // dark
    const c8 = parseAlgebraicSquare('c8')!; // light
    let b = createEmptyBoard();
    b = setPiece(b, e1, piece('w', 'k'));
    b = setPiece(b, c1, piece('w', 'b'));
    b = setPiece(b, e8, piece('b', 'k'));
    b = setPiece(b, c8, piece('b', 'b'));

    const s = mkState({ board: b, sideToMove: 'w' });
    expect(getGameStatus(s).kind).toBe('inProgress');
  });
});
