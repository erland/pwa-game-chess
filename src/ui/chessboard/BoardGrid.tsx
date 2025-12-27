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
    disabled,
    dragging,
    getSquareClass,
    isLegalDestination,
    squareAriaLabel,
    getSquareHandlers
  } = props;

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
