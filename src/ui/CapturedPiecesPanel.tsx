import type { Color, PieceType } from '../domain/chessTypes';
import type { CapturedPieces } from '../domain/material/captured';
import { captureMaterialDelta } from '../domain/material/captured';

function pieceTypeToGlyph(color: Color, type: PieceType): string {
  const isWhite = color === 'w';
  switch (type) {
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

function groupCounts(pieces: PieceType[]): Array<{ type: PieceType; count: number }> {
  const map = new Map<PieceType, number>();
  for (const p of pieces) map.set(p, (map.get(p) ?? 0) + 1);
  // Preserve the input order as much as possible
  const seen = new Set<PieceType>();
  const out: Array<{ type: PieceType; count: number }> = [];
  for (const p of pieces) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push({ type: p, count: map.get(p) ?? 0 });
  }
  return out;
}

export type CapturedPiecesProps = {
  captured: CapturedPieces;
  /** Show a small "+X" material delta indicator. */
  showDelta?: boolean;
};

export function CapturedPiecesPanel({ captured, showDelta }: CapturedPiecesProps) {
  const delta = captureMaterialDelta(captured);

  // Pieces captured BY White are Black pieces (so render as black glyphs), and vice versa.
  const whiteCaps = groupCounts(captured.w);
  const blackCaps = groupCounts(captured.b);

  return (
    <div className="capturedPanel" aria-label="Captured pieces">
      <div className="capturedRow" aria-label="Black captured pieces">
        <span className="capturedLabel">Black</span>
        <div className="capturedPieces">
          {blackCaps.length === 0 ? (
            <span className="muted">—</span>
          ) : (
            blackCaps.map(({ type, count }) => (
              <span key={`b-${type}`} className="capturedItem" aria-label={`captured ${count} ${type}`}>
                <span className="capturedGlyph">{pieceTypeToGlyph('w', type)}</span>
                {count > 1 && <span className="capturedCount">×{count}</span>}
              </span>
            ))
          )}
        </div>
        {showDelta && delta < 0 && <span className="capturedDelta">{delta}</span>}
      </div>

      <div className="capturedRow" aria-label="White captured pieces">
        <span className="capturedLabel">White</span>
        <div className="capturedPieces">
          {whiteCaps.length === 0 ? (
            <span className="muted">—</span>
          ) : (
            whiteCaps.map(({ type, count }) => (
              <span key={`w-${type}`} className="capturedItem" aria-label={`captured ${count} ${type}`}>
                <span className="capturedGlyph">{pieceTypeToGlyph('b', type)}</span>
                {count > 1 && <span className="capturedCount">×{count}</span>}
              </span>
            ))
          )}
        </div>
        {showDelta && delta > 0 && <span className="capturedDelta">+{delta}</span>}
      </div>
    </div>
  );
}
