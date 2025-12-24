import { useMemo, useRef, useState } from 'react';

import type { Orientation } from '../domain/localSetup';
import type { GameState, Move, Piece, Square } from '../domain/chessTypes';
import { getPiece } from '../domain/board';
import { generateLegalMoves } from '../domain/legalMoves';
import { FILES, RANKS, fileOf, makeSquare, rankOf, toAlgebraic } from '../domain/square';

export type ChessBoardProps = {
  state: GameState;
  orientation: Orientation;
  selectedSquare: Square | null;
  legalMovesFromSelection: Move[];
  /** Optional hint move (for highlighting). */
  hintMove?: { from: Square; to: Square } | null;
  /** Last move played (for highlighting). */
  lastMove?: { from: Square; to: Square } | null;
  /** Squares to highlight as "in check" (typically one king square). */
  checkSquares?: Square[];
  onSquareClick: (square: Square) => void;
  onMoveAttempt: (from: Square, to: Square, candidates: Move[]) => void;
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
  hintMove,
  lastMove,
  checkSquares,
  onSquareClick,
  onMoveAttempt,
  disabled
}: ChessBoardProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState<{
    origin: Square;
    piece: Piece;
    startX: number;
    startY: number;
    clientX: number;
    clientY: number;
    isDragging: boolean;
    // Cache legal moves for the origin to make drag robust even if selection state updates a bit later.
    legalMoves: Move[];
  } | null>(null);

  const effectiveSelectedSquare = dragging ? dragging.origin : selectedSquare;
  const effectiveLegalMoves = dragging ? dragging.legalMoves : legalMovesFromSelection;

  const displaySquares = useMemo(() => squaresForOrientation(orientation), [orientation]);

  const lastFrom = lastMove ? lastMove.from : null;
  const lastTo = lastMove ? lastMove.to : null;
  const hintFrom = hintMove ? hintMove.from : null;
  const hintTo = hintMove ? hintMove.to : null;
  const checkSet = new Set<Square>(checkSquares ?? []);

  const legalDestinations = new Set<Square>();
  const captureDestinations = new Set<Square>();
  for (const m of effectiveLegalMoves) {
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

        <div
          ref={boardRef}
          className="board"
          role="grid"
          aria-label="Chess board"
          // Prevent touch scrolling from interfering with drag.
          style={{ touchAction: 'none' }}
        >
          {displaySquares.map((sq) => {
            const piece = getPiece(state.board, sq);
            const isSelected = effectiveSelectedSquare === sq;
            const isLegal = legalDestinations.has(sq);
            const isCapture = captureDestinations.has(sq);
            const isDark = isDarkSquare(sq);
            const isLastFrom = lastFrom === sq;
            const isLastTo = lastTo === sq;
            const isCheck = checkSet.has(sq);
            const isHintFrom = hintFrom === sq;
            const isHintTo = hintTo === sq;

            const className = [
              'boardSq',
              isDark ? 'boardSq-dark' : 'boardSq-light',
              isSelected ? 'boardSq-selected' : '',
              isLastFrom ? 'boardSq-lastFrom' : '',
              isLastTo ? 'boardSq-lastTo' : '',
              isCheck ? 'boardSq-check' : '',
              isLegal ? 'boardSq-legal' : '',
              isCapture ? 'boardSq-capture' : '',
              isHintFrom ? 'boardSq-hintFrom' : '',
              isHintTo ? 'boardSq-hintTo' : ''
            ]
              .filter(Boolean)
              .join(' ');

            const isDraggingOrigin = Boolean(dragging?.isDragging) && dragging?.origin === sq;

            return (
              <button
                key={sq}
                type="button"
                className={className}
                aria-label={squareAriaLabel(state, sq)}
                onClick={() => {
                  if (disabled) return;
                  // If a drag occurred, the browser will still fire a click on pointer-up.
                  // Suppress it so we don't toggle selection or re-attempt moves.
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  onSquareClick(sq);
                }}
                onPointerDown={(e) => {
                  if (disabled) return;
                  if (!piece) return;
                  if (piece.color !== state.sideToMove) return;

                  // Start tracking drag. We'll consider it a drag once pointer moves past threshold.
                  // Cache legal moves for origin to make drop resolution deterministic.
                  suppressClickRef.current = false;

                  setDragging({
                    origin: sq,
                    piece,
                    startX: e.clientX,
                    startY: e.clientY,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    isDragging: false,
                    // Don't call onSquareClick here: userEvent.click triggers pointerdown + click.
                    // Calling onSquareClick twice can toggle selection off (and tests/users won't see highlights).
                    // Instead, compute legal moves directly for drag UI.
                    legalMoves: generateLegalMoves(state, sq)
                  });

                  // Keep receiving move events even if pointer leaves the square.
                  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!dragging) return;
                  // Only update if we're dragging the same origin piece.
                  if (dragging.origin !== sq) return;
                  const dx = e.clientX - dragging.startX;
                  const dy = e.clientY - dragging.startY;
                  const dist = Math.hypot(dx, dy);
                  const nextIsDragging = dragging.isDragging || dist >= 6;
                  if (nextIsDragging) suppressClickRef.current = true;

                  setDragging((prev) =>
                    prev
                      ? {
                          ...prev,
                          clientX: e.clientX,
                          clientY: e.clientY,
                          isDragging: nextIsDragging
                        }
                      : prev
                  );
                }}
                onPointerUp={(e) => {
                  if (!dragging) return;
                  if (dragging.origin !== sq) return;

                  if (disabled) {
                    setDragging(null);
                    suppressClickRef.current = false;
                    return;
                  }

                  // Not a drag (tap / click). Let the normal onClick handler run.
                  if (!dragging.isDragging) {
                    setDragging(null);
                    return;
                  }

                  const boardEl = boardRef.current;
                  if (!boardEl) {
                    setDragging(null);
                    return;
                  }

                  const rect = boardEl.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  const fileIdx = Math.max(0, Math.min(7, Math.floor((x / rect.width) * 8)));
                  const rankFromTop = Math.max(0, Math.min(7, Math.floor((y / rect.height) * 8)));

                  const file = orientation === 'w' ? fileIdx : 7 - fileIdx;
                  const rank = orientation === 'w' ? 7 - rankFromTop : rankFromTop;
                  const dest = makeSquare(file, rank);

                  if (dest === null) {
                    setDragging(null);
                    return;
                  }

                  // Treat as a drag-drop move attempt if destination differs.
                  if (dest !== dragging.origin) {
                    const destPiece = getPiece(state.board, dest);
                    if (destPiece && destPiece.color === state.sideToMove) {
                      // Dropped on own piece: change selection.
                      onSquareClick(dest);
                    } else {
                      const candidates = dragging.legalMoves.filter((m) => m.to === dest);
                      // Always report the attempt so the parent can show feedback.
                      onMoveAttempt(dragging.origin, dest, candidates);
                    }
                  }

                  setDragging(null);
                }}
                disabled={disabled}
              >
                <span className="boardPiece" aria-hidden>
                  {piece && !isDraggingOrigin ? pieceToGlyph(piece) : ''}
                </span>
                {/* Hint dots for legal moves. */}
                {isLegal && !piece && <span className="boardHint" aria-hidden />}
              </button>
            );
          })}
        </div>

        {dragging?.isDragging && (
          <div className="dragLayer" aria-hidden>
            <div
              className="dragPiece"
              style={{
                left: dragging.clientX,
                top: dragging.clientY
              }}
            >
              {pieceToGlyph(dragging.piece)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
