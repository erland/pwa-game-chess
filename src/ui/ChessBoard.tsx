import type { Orientation } from '../domain/localSetup';
import type { GameState, Move, Piece, Square } from '../domain/chessTypes';
import { getPiece } from '../domain/board';
import { FILES, RANKS, fileOf, makeSquare, rankOf, toAlgebraic } from '../domain/square';

export type ChessBoardProps = {
  state: GameState;
  orientation: Orientation;
  selectedSquare: Square | null;
  legalMovesFromSelection: Move[];
  onSquareClick: (square: Square) => void;
  disabled?: boolean;
};

const WHITE_VIEW_SQUARES: Square[] = (() => {
  const squares: Square[] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    for (let file = 0; file < 8; file += 1) {
      const sq = makeSquare(file, rank);
      if (sq !== null) squares.push(sq);
    }
  }
  return squares;
})();

function squaresForOrientation(orientation: Orientation): Square[] {
  if (orientation === 'w') return WHITE_VIEW_SQUARES;
  // Rotate 180 degrees.
  return WHITE_VIEW_SQUARES.map((sq) => (63 - sq) as Square);
}

function isDarkSquare(square: Square): boolean {
  // Convention: a1 is dark.
  return (fileOf(square) + rankOf(square)) % 2 === 0;
}

function pieceToGlyph(piece: Piece): string {
  const isWhite = piece.color === 'w';
  switch (piece.type) {
    case 'k':
      return isWhite ? '♔' : '♚';
    case 'q':
      return isWhite ? '♕' : '♛';
    case 'r':
      return isWhite ? '♖' : '♜';
    case 'b':
      return isWhite ? '♗' : '♝';
    case 'n':
      return isWhite ? '♘' : '♞';
    case 'p':
      return isWhite ? '♙' : '♟';
    default:
      return '';
  }
}

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
  onSquareClick,
  disabled
}: ChessBoardProps) {
  const displaySquares = squaresForOrientation(orientation);

  const legalDestinations = new Set<Square>();
  const captureDestinations = new Set<Square>();
  for (const m of legalMovesFromSelection) {
    legalDestinations.add(m.to);
    const targetPiece = getPiece(state.board, m.to);
    const isCapture = Boolean(targetPiece) || Boolean(m.isEnPassant);
    if (isCapture) captureDestinations.add(m.to);
  }

  // For coordinate labels, decide which files/ranks should be shown from the viewer's perspective.
  const files = orientation === 'w' ? FILES : [...FILES].reverse();
  const ranks = orientation === 'w' ? [...RANKS].reverse() : RANKS;

  return (
    <div className="boardWrap">
      <div className="boardCoords boardCoords-top" aria-hidden>
        {files.map((f) => (
          <div key={f} className="coord">
            {f}
          </div>
        ))}
      </div>

      <div className="boardRow">
        <div className="boardCoords boardCoords-left" aria-hidden>
          {ranks.map((r) => (
            <div key={r} className="coord">
              {r}
            </div>
          ))}
        </div>

        <div className="board" role="grid" aria-label="Chess board">
          {displaySquares.map((sq) => {
            const piece = getPiece(state.board, sq);
            const isSelected = selectedSquare === sq;
            const isLegal = legalDestinations.has(sq);
            const isCapture = captureDestinations.has(sq);
            const isDark = isDarkSquare(sq);

            const className = [
              'boardSq',
              isDark ? 'boardSq-dark' : 'boardSq-light',
              isSelected ? 'boardSq-selected' : '',
              isLegal ? 'boardSq-legal' : '',
              isCapture ? 'boardSq-capture' : ''
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={sq}
                type="button"
                className={className}
                aria-label={squareAriaLabel(state, sq)}
                onClick={() => onSquareClick(sq)}
                disabled={disabled}
              >
                <span className="boardPiece" aria-hidden>
                  {piece ? pieceToGlyph(piece) : ''}
                </span>
                {/* Hint dots for legal moves. */}
                {isLegal && !piece && <span className="boardHint" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
