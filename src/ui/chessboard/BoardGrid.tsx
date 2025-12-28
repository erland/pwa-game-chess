import type { RefObject } from 'react';

import type { GameState, Piece, Square } from '../../domain/chessTypes';
import { getPiece } from '../../domain/board';
import { PieceIcon } from '../PieceIcon';
import { SquareButton } from './SquareButton';
import type { SquareHandlers, DragState } from './useBoardInteraction';

export function BoardGrid(props: {
  state: GameState;
  boardRef: RefObject<HTMLDivElement>;
  files: readonly string[];
  ranks: readonly number[];
  displaySquares: Square[];
  displayIndexBySquare: ReadonlyMap<Square, number>;
  hintMove?: { from: Square; to: Square } | null;
  showHintArrow?: boolean;
  disabled?: boolean;
  dragging: DragState;
  getSquareClass: (sq: Square) => string;
  isLegalDestination: (sq: Square) => boolean;
  squareAriaLabel: (sq: Square) => string;
  getSquareHandlers: (sq: Square, piece: Piece | null) => SquareHandlers;
}) {
  const {
    state,
    boardRef,
    files,
    ranks,
    displaySquares,
    displayIndexBySquare,
    hintMove,
    showHintArrow,
    disabled,
    dragging,
    getSquareClass,
    isLegalDestination,
    squareAriaLabel,
    getSquareHandlers
  } = props;

  const arrow = (() => {
    if (!showHintArrow || !hintMove) return null;
    const fromIdx = displayIndexBySquare.get(hintMove.from);
    const toIdx = displayIndexBySquare.get(hintMove.to);
    if (fromIdx === undefined || toIdx === undefined) return null;
    const fromRow = Math.floor(fromIdx / 8);
    const fromCol = fromIdx % 8;
    const toRow = Math.floor(toIdx / 8);
    const toCol = toIdx % 8;
    return { x1: fromCol + 0.5, y1: fromRow + 0.5, x2: toCol + 0.5, y2: toRow + 0.5 };
  })();

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
          {arrow && (
            <svg className="boardOverlay" viewBox="0 0 8 8" aria-hidden="true">
              <defs>
                <marker
                  id="hintArrowHead"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="4"
                  markerHeight="4"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" className="hintArrowHead" />
                </marker>
              </defs>
              <line
                x1={arrow.x1}
                y1={arrow.y1}
                x2={arrow.x2}
                y2={arrow.y2}
                markerEnd="url(#hintArrowHead)"
                className="hintArrowLine"
              />
            </svg>
          )}
          {displaySquares.map((sq) => {
            const piece = getPiece(state.board, sq);
            const className = getSquareClass(sq);
            const isDraggingOrigin = Boolean(dragging?.isDragging) && dragging?.origin === sq;
            const handlers = getSquareHandlers(sq, piece);
            const showHintDot = isLegalDestination(sq) && !piece;

            return (
              <SquareButton
                key={sq}
                square={sq}
                className={className}
                ariaLabel={squareAriaLabel(sq)}
                disabled={disabled}
                piece={piece}
                isDraggingOrigin={isDraggingOrigin}
                showHintDot={showHintDot}
                handlers={handlers}
              />
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
              <PieceIcon ariaHidden color={dragging.piece.color} type={dragging.piece.type} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}