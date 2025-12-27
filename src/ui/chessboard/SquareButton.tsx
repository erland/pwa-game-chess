import type { Piece, Square } from '../../domain/chessTypes';
import { PieceIcon } from '../PieceIcon';
import type { SquareHandlers } from './useBoardInteraction';

export function SquareButton(props: {
  square: Square;
  className: string;
  ariaLabel: string;
  disabled?: boolean;
  piece: Piece | null;
  isDraggingOrigin: boolean;
  showHintDot: boolean;
  handlers: SquareHandlers;
}) {
  const { className, ariaLabel, disabled, piece, isDraggingOrigin, showHintDot, handlers } = props;

  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      onClick={handlers.onClick}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerCancel}
      disabled={disabled}
    >
      <span className="boardPiece" aria-hidden>
        {piece && !isDraggingOrigin ? <PieceIcon ariaHidden color={piece.color} type={piece.type} /> : null}
      </span>
      {/* Hint dots for legal moves. */}
      {showHintDot ? <span className="boardHint" aria-hidden /> : null}
    </button>
  );
}
