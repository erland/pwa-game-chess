import {
  createEmptyBoard,
  createInitialGameState,
  generatePseudoLegalMoves,
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
    ...partial
  };
}

function squares(moves: Move[]): string[] {
  return moves.map((m) => `${toAlgebraic(m.from)}-${toAlgebraic(m.to)}${m.promotion ? '=' + m.promotion : ''}`);
}

describe('generatePseudoLegalMoves', () => {
  it('starting position (white to move) has 20 pseudo-legal moves', () => {
    const state = createInitialGameState();
    const moves = generatePseudoLegalMoves(state);
    expect(moves).toHaveLength(20);
  });

  it('pawn single+double push from starting rank', () => {
    const state = createInitialGameState();
    const e2 = parseAlgebraicSquare('e2')!;
    const moves = generatePseudoLegalMoves(state, e2);
    const ts = squares(moves);
    expect(ts).toContain('e2-e3');
    expect(ts).toContain('e2-e4');
  });

  it('knight moves from center and edge', () => {
    const d4 = parseAlgebraicSquare('d4')!;
    const a1 = parseAlgebraicSquare('a1')!;

    const stateCenter = mkState({ board: setPiece(createEmptyBoard(), d4, piece('w', 'n')) });
    const centerMoves = generatePseudoLegalMoves(stateCenter, d4);
    expect(centerMoves).toHaveLength(8);
    const center = squares(centerMoves);
    for (const target of ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5']) {
      expect(center).toContain(`d4-${target}`);
    }

    const stateEdge = mkState({ board: setPiece(createEmptyBoard(), a1, piece('w', 'n')) });
    const edgeMoves = generatePseudoLegalMoves(stateEdge, a1);
    const edge = squares(edgeMoves);
    expect(edge).toHaveLength(2);
    expect(edge).toContain('a1-b3');
    expect(edge).toContain('a1-c2');
  });

  it('sliding piece is blocked by own piece', () => {
    const c1 = parseAlgebraicSquare('c1')!;
    const d2 = parseAlgebraicSquare('d2')!;
    let b = createEmptyBoard();
    b = setPiece(b, c1, piece('w', 'b'));
    b = setPiece(b, d2, piece('w', 'p'));
    const state = mkState({ board: b });

    const moves = generatePseudoLegalMoves(state, c1);
    const ts = squares(moves);
    expect(ts).toHaveLength(2);
    expect(ts).toContain('c1-b2');
    expect(ts).toContain('c1-a3');
  });

  it('promotion generates 4 moves', () => {
    const a7 = parseAlgebraicSquare('a7')!;
    const a8 = parseAlgebraicSquare('a8')!;
    let b = createEmptyBoard();
    b = setPiece(b, a7, piece('w', 'p'));
    const state = mkState({ board: b });

    const moves = generatePseudoLegalMoves(state, a7);
    const promoToA8 = moves.filter((m) => m.to === a8);
    expect(promoToA8).toHaveLength(4);
    const ps = promoToA8.map((m) => m.promotion).sort();
    expect(ps).toEqual(['b', 'n', 'q', 'r']);
  });

  it('en passant candidate is generated when target is set', () => {
    const e5 = parseAlgebraicSquare('e5')!;
    const d6 = parseAlgebraicSquare('d6')!;
    const d5 = parseAlgebraicSquare('d5')!;

    let b = createEmptyBoard();
    b = setPiece(b, e5, piece('w', 'p'));
    b = setPiece(b, d5, piece('b', 'p'));
    const state = mkState({ board: b, enPassantTarget: d6 });

    const moves = generatePseudoLegalMoves(state, e5);
    const ep = moves.find((m) => m.to === d6 && m.isEnPassant);
    expect(ep).toBeTruthy();
  });

  it('castle candidates are generated when rights + path allow', () => {
    const e1 = parseAlgebraicSquare('e1')!;
    const a1 = parseAlgebraicSquare('a1')!;
    const h1 = parseAlgebraicSquare('h1')!;
    const c1 = parseAlgebraicSquare('c1')!;
    const g1 = parseAlgebraicSquare('g1')!;

    let b = createEmptyBoard();
    b = setPiece(b, e1, piece('w', 'k'));
    b = setPiece(b, a1, piece('w', 'r'));
    b = setPiece(b, h1, piece('w', 'r'));
    const state = mkState({
      board: b,
      castling: { wK: true, wQ: true, bK: false, bQ: false }
    });

    const moves = generatePseudoLegalMoves(state, e1);
    const kSide = moves.find((m) => m.to === g1 && m.isCastle && m.castleSide === 'k');
    const qSide = moves.find((m) => m.to === c1 && m.isCastle && m.castleSide === 'q');
    expect(kSide).toBeTruthy();
    expect(qSide).toBeTruthy();
  });
});
