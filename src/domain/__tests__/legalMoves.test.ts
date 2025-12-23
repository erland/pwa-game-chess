import {
  createEmptyBoard,
  generateLegalMoves,
  isInCheck,
  parseAlgebraicSquare,
  setPiece,
  toAlgebraic
} from '../index';
import type { GameState, Move, Piece } from '../chessTypes';

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

function squares(moves: Move[]): string[] {
  return moves.map((m) => `${toAlgebraic(m.from)}-${toAlgebraic(m.to)}${m.isCastle ? ' (O-O' + (m.castleSide === 'q' ? '-O' : '') + ')' : ''}`);
}

describe('Step 5 — check detection + legal move filtering', () => {
  it('isInCheck detects rook checks and blockers', () => {
    const e1 = parseAlgebraicSquare('e1')!;
    const e8 = parseAlgebraicSquare('e8')!;
    const e2 = parseAlgebraicSquare('e2')!;

    // Direct rook check (no blockers)
    let b = createEmptyBoard();
    b = setPiece(b, e1, piece('w', 'k'));
    b = setPiece(b, e8, piece('b', 'r'));
    const s1 = mkState({ board: b, sideToMove: 'w' });
    expect(isInCheck(s1, 'w')).toBe(true);

    // Blocked rook line -> no check
    let b2 = createEmptyBoard();
    b2 = setPiece(b2, e1, piece('w', 'k'));
    b2 = setPiece(b2, e8, piece('b', 'r'));
    b2 = setPiece(b2, e2, piece('w', 'p'));
    const s2 = mkState({ board: b2, sideToMove: 'w' });
    expect(isInCheck(s2, 'w')).toBe(false);
  });

  it('pinned piece cannot move off the line exposing its king', () => {
    const e1 = parseAlgebraicSquare('e1')!;
    const e2 = parseAlgebraicSquare('e2')!;
    const e8 = parseAlgebraicSquare('e8')!;

    let b = createEmptyBoard();
    b = setPiece(b, e1, piece('w', 'k'));
    b = setPiece(b, e2, piece('w', 'r'));
    b = setPiece(b, e8, piece('b', 'r'));

    const state = mkState({ board: b, sideToMove: 'w' });

    const legal = generateLegalMoves(state, e2);
    const ts = squares(legal);

    // Rook cannot move sideways; would expose king to rook check on e-file
    expect(ts).not.toContain('e2-d2');
    expect(ts).not.toContain('e2-f2');

    // But it can move along the e-file (still blocks or captures attacker)
    expect(ts).toContain('e2-e3');
    expect(ts).toContain('e2-e8');
  });

  it('king cannot move into check', () => {
    const e1 = parseAlgebraicSquare('e1')!;
    const e2 = parseAlgebraicSquare('e2')!;
    const e8 = parseAlgebraicSquare('e8')!;

    let b = createEmptyBoard();
    b = setPiece(b, e1, piece('w', 'k'));
    b = setPiece(b, e8, piece('b', 'r')); // attacks e2

    const state = mkState({ board: b, sideToMove: 'w' });

    const legalKing = generateLegalMoves(state, e1);
    const ts = squares(legalKing);
    expect(ts).not.toContain('e1-e2');
  });

  it('castling is illegal if king passes through attacked squares', () => {
    const e1 = parseAlgebraicSquare('e1')!;
    const h1 = parseAlgebraicSquare('h1')!;
    const g1 = parseAlgebraicSquare('g1')!;
    const c4 = parseAlgebraicSquare('c4')!;

    // Black bishop on c4 attacks f1, so white king cannot castle king-side.
    let b = createEmptyBoard();
    b = setPiece(b, e1, piece('w', 'k'));
    b = setPiece(b, h1, piece('w', 'r'));
    b = setPiece(b, c4, piece('b', 'b'));

    const state = mkState({
      board: b,
      sideToMove: 'w',
      castling: { wK: true, wQ: false, bK: false, bQ: false }
    });

    const legal = generateLegalMoves(state, e1);
    const castle = legal.find((m) => m.isCastle && m.to === g1);
    expect(castle).toBeFalsy();
  });

  it('castling is illegal if king is currently in check', () => {
    const e1 = parseAlgebraicSquare('e1')!;
    const h1 = parseAlgebraicSquare('h1')!;
    const g1 = parseAlgebraicSquare('g1')!;
    const e8 = parseAlgebraicSquare('e8')!;

    // Rook gives check on e-file; castling should be disallowed.
    let b = createEmptyBoard();
    b = setPiece(b, e1, piece('w', 'k'));
    b = setPiece(b, h1, piece('w', 'r'));
    b = setPiece(b, e8, piece('b', 'r'));

    const state = mkState({
      board: b,
      sideToMove: 'w',
      castling: { wK: true, wQ: false, bK: false, bQ: false }
    });

    expect(isInCheck(state, 'w')).toBe(true);

    const legal = generateLegalMoves(state, e1);
    const castle = legal.find((m) => m.isCastle && m.to === g1);
    expect(castle).toBeFalsy();
  });

  it('castling is legal when path is clear and not attacked', () => {
    const e1 = parseAlgebraicSquare('e1')!;
    const h1 = parseAlgebraicSquare('h1')!;
    const g1 = parseAlgebraicSquare('g1')!;

    let b = createEmptyBoard();
    b = setPiece(b, e1, piece('w', 'k'));
    b = setPiece(b, h1, piece('w', 'r'));

    const state = mkState({
      board: b,
      sideToMove: 'w',
      castling: { wK: true, wQ: false, bK: false, bQ: false }
    });

    const legal = generateLegalMoves(state, e1);
    const castle = legal.find((m) => m.isCastle && m.to === g1);
    expect(castle).toBeTruthy();
  });
});
