import { applyMove } from '../applyMove';
import { createEmptyBoard, getPiece, setPiece } from '../board';
import type { GameState, Move } from '../chessTypes';
import { makeSquare } from '../square';

function sq(file: number, rank: number): number {
  const s = makeSquare(file, rank);
  if (s === null) throw new Error('invalid square');
  return s;
}

function baseState(overrides?: Partial<GameState>): GameState {
  return {
    board: createEmptyBoard(),
    sideToMove: 'w',
    castling: { wK: false, wQ: false, bK: false, bQ: false },
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    history: [],
    forcedStatus: null,
    ...overrides
  };
}

describe('applyMove', () => {
  it('executes king-side castling (moves rook + clears castling rights)', () => {
    // White: Ke1, Rh1 (empty path)
    let board = createEmptyBoard();
    board = setPiece(board, sq(4, 0), { color: 'w', type: 'k' }); // e1
    board = setPiece(board, sq(7, 0), { color: 'w', type: 'r' }); // h1

    const state = baseState({
      board,
      castling: { wK: true, wQ: true, bK: false, bQ: false }
    });

    const move: Move = { from: sq(4, 0), to: sq(6, 0), isCastle: true, castleSide: 'k' }; // e1->g1
    const next = applyMove(state, move);

    expect(getPiece(next.board, sq(6, 0))).toEqual({ color: 'w', type: 'k' }); // g1
    expect(getPiece(next.board, sq(5, 0))).toEqual({ color: 'w', type: 'r' }); // f1
    expect(getPiece(next.board, sq(7, 0))).toBeNull();
    expect(getPiece(next.board, sq(4, 0))).toBeNull();

    expect(next.castling.wK).toBe(false);
    expect(next.castling.wQ).toBe(false);
    expect(next.sideToMove).toBe('b');
    expect(next.enPassantTarget).toBeNull();
    expect(next.halfmoveClock).toBe(1);
    expect(next.fullmoveNumber).toBe(1);
    expect(next.history).toHaveLength(1);
    expect(next.history[0].isCastle).toBe(true);
  });

  it('executes en passant capture (removes captured pawn behind target)', () => {
    // White pawn on e5 captures black pawn on d5 en passant to d6.
    let board = createEmptyBoard();
    board = setPiece(board, sq(4, 4), { color: 'w', type: 'p' }); // e5
    board = setPiece(board, sq(3, 4), { color: 'b', type: 'p' }); // d5
    board = setPiece(board, sq(4, 7), { color: 'b', type: 'k' }); // e8 (not used here, but keeps positions sensible)
    board = setPiece(board, sq(4, 0), { color: 'w', type: 'k' }); // e1

    const state = baseState({
      board,
      enPassantTarget: sq(3, 5), // d6
      sideToMove: 'w'
    });

    const move: Move = { from: sq(4, 4), to: sq(3, 5), isEnPassant: true }; // e5->d6
    const next = applyMove(state, move);

    expect(getPiece(next.board, sq(3, 5))).toEqual({ color: 'w', type: 'p' }); // d6
    expect(getPiece(next.board, sq(3, 4))).toBeNull(); // captured pawn removed
    expect(next.halfmoveClock).toBe(0);
    expect(next.enPassantTarget).toBeNull();
    expect(next.history[0].captured).toEqual({ color: 'b', type: 'p' });
  });

  it('handles pawn promotion (replaces pawn with selected piece)', () => {
    let board = createEmptyBoard();
    board = setPiece(board, sq(0, 6), { color: 'w', type: 'p' }); // a7
    board = setPiece(board, sq(4, 0), { color: 'w', type: 'k' });
    board = setPiece(board, sq(4, 7), { color: 'b', type: 'k' });

    const state = baseState({ board, sideToMove: 'w' });
    const move: Move = { from: sq(0, 6), to: sq(0, 7), promotion: 'n' }; // a7->a8=N
    const next = applyMove(state, move);

    expect(getPiece(next.board, sq(0, 7))).toEqual({ color: 'w', type: 'n' });
    expect(next.history[0].promotion).toBe('n');
    expect(next.halfmoveClock).toBe(0);
  });

  it('sets enPassantTarget on pawn double push', () => {
    let board = createEmptyBoard();
    board = setPiece(board, sq(4, 1), { color: 'w', type: 'p' }); // e2
    board = setPiece(board, sq(4, 0), { color: 'w', type: 'k' });
    board = setPiece(board, sq(4, 7), { color: 'b', type: 'k' });

    const state = baseState({ board, sideToMove: 'w' });
    const move: Move = { from: sq(4, 1), to: sq(4, 3) }; // e2->e4
    const next = applyMove(state, move);

    expect(next.enPassantTarget).toBe(sq(4, 2)); // e3
    expect(next.halfmoveClock).toBe(0);
  });

  it('increments fullmove number after black move', () => {
    let board = createEmptyBoard();
    board = setPiece(board, sq(4, 0), { color: 'w', type: 'k' });
    board = setPiece(board, sq(4, 7), { color: 'b', type: 'k' });
    board = setPiece(board, sq(0, 7), { color: 'b', type: 'r' }); // a8

    const state = baseState({ board, sideToMove: 'b', fullmoveNumber: 7 });
    const move: Move = { from: sq(0, 7), to: sq(0, 6) }; // a8->a7
    const next = applyMove(state, move);
    expect(next.fullmoveNumber).toBe(8);
    expect(next.sideToMove).toBe('w');
  });
});
