import { useEffect } from 'react';

import type { Color, Move, PieceType } from '../domain/chessTypes';

export type PromotionChooserProps = {
  color: Color;
  options: Move[];
  onChoose: (move: Move) => void;
  onCancel: () => void;
};

const ORDER: PieceType[] = ['q', 'r', 'b', 'n'];

function glyph(color: Color, type: PieceType): string {
  const isWhite = color === 'w';
  switch (type) {
    case 'q':
      return isWhite ? '♕' : '♛';
    case 'r':
      return isWhite ? '♖' : '♜';
    case 'b':
      return isWhite ? '♗' : '♝';
    case 'n':
      return isWhite ? '♘' : '♞';
    default:
      return '';
  }
}

function pieceLabel(type: PieceType): string {
  switch (type) {
    case 'q':
      return 'Queen';
    case 'r':
      return 'Rook';
    case 'b':
      return 'Bishop';
    case 'n':
      return 'Knight';
    default:
      return 'Piece';
  }
}

export function PromotionChooser({ color, options, onChoose, onCancel }: PromotionChooserProps) {
  // Build a stable ordered list.
  const optionByType = new Map<PieceType, Move>();
  for (const m of options) {
    if (m.promotion) optionByType.set(m.promotion, m);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Choose promotion"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="h3">Promote pawn</h3>
        <p className="muted">Choose a piece.</p>

        <div className="promoGrid">
          {ORDER.map((t) => {
            const move = optionByType.get(t);
            if (!move) return null;
            return (
              <button
                key={t}
                type="button"
                className="promoBtn"
                onClick={() => onChoose(move)}
              >
                <div className="promoPiece" aria-hidden>
                  {glyph(color, t)}
                </div>
                <div className="promoLabel">{pieceLabel(t)}</div>
              </button>
            );
          })}
        </div>

        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
