import type { Orientation } from '../domain/localSetup';
import type { GameState, Move, Piece, Square } from '../domain/chessTypes';
import { getPiece } from '../domain/board';
import { toAlgebraic } from '../domain/square';

import { BoardGrid } from './chessboard/BoardGrid';
import { useBoardGeometry } from './chessboard/useBoardGeometry';
import { useBoardHighlights } from './chessboard/useBoardHighlights';
import { useBoardInteraction } from './chessboard/useBoardInteraction';

export type ChessBoardProps = {
  state: GameState;
  orientation: Orientation;
  selectedSquare: Square | null;
  legalMovesFromSelection: Move[];
  /** Optional hint move (for highlighting). */
  hintMove?: { from: Square; to: Square } | null;
  /** Last move played (for highlighting). */
  lastMove?: { from: Square; to: Square } | null;
  /** Squares that should be highlighted as check (usually king square). */
  checkSquares?: Square[];
  /** When a square is clicked (selection / move attempt). */
  onSquareClick: (square: Square) => void;
  /** When a move is attempted (from->to), report candidates (possibly empty). */
  onMoveAttempt: (from: Square, to: Square, candidates: Move[]) => void;
  /** Disable interaction (e.g. game over or AI thinking). */
  disabled?: boolean;
};

function pieceName(piece: Piece): string {
  const color = piece.color === 'w' ? 'white' : 'black';
  const type =
    piece.type === 'k'
      ? 'king'
      : piece.type === 'q'
        ? 'queen'
        : piece.type === 'r'
          ? 'rook'
          : piece.type === 'b'
            ? 'bishop'
            : piece.type === 'n'
              ? 'knight'
              : 'pawn';
  return `${color} ${type}`;
}

function squareAriaLabel(state: GameState, square: Square): string {
  const alg = toAlgebraic(square);
  const piece = getPiece(state.board, square);
  if (!piece) return `Square ${alg}`;
  return `Square ${alg}, ${pieceName(piece)}`;
}

export function ChessBoard({
  state,
  orientation,
  selectedSquare,
  legalMovesFromSelection,
  hintMove,
  lastMove,
  checkSquares,
  onSquareClick,
  onMoveAttempt,
  disabled
}: ChessBoardProps) {
  const geometry = useBoardGeometry(orientation);

  const interaction = useBoardInteraction({
    state,
    disabled,
    onSquareClick,
    onMoveAttempt,
    squareFromClientPoint: geometry.squareFromClientPoint
  });

  const effectiveSelectedSquare = interaction.dragging ? interaction.dragging.origin : selectedSquare;
  const effectiveLegalMoves = interaction.dragging ? interaction.dragging.legalMoves : legalMovesFromSelection;

  const highlights = useBoardHighlights({
    state,
    selectedSquare: effectiveSelectedSquare,
    legalMoves: effectiveLegalMoves,
    hintMove,
    lastMove,
    checkSquares
  });

  return (
    <BoardGrid
      state={state}
      boardRef={interaction.boardRef}
      files={geometry.files}
      ranks={geometry.ranks}
      displaySquares={geometry.displaySquares}
      disabled={disabled}
      dragging={interaction.dragging}
      getSquareClass={highlights.getSquareClass}
      isLegalDestination={highlights.isLegalDestination}
      squareAriaLabel={(sq) => squareAriaLabel(state, sq)}
      getSquareHandlers={interaction.getSquareHandlers}
    />
  );
}
