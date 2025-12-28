import { useCallback, useMemo } from 'react';

import type { Orientation } from '../../domain/localSetup';
import type { Square } from '../../domain/chessTypes';
import { FILES, RANKS, makeSquare } from '../../domain/square';

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

export function useBoardGeometry(orientation: Orientation) {
  const displaySquares = useMemo(() => squaresForOrientation(orientation), [orientation]);

  // Fast lookup for overlays (e.g. hint arrows) without O(n) indexOf scans.
  const displayIndexBySquare = useMemo(() => {
    const m = new Map<Square, number>();
    displaySquares.forEach((sq, i) => m.set(sq, i));
    return m;
  }, [displaySquares]);

  // Coordinate labels from viewer's perspective.
  const files = useMemo(() => (orientation === 'w' ? FILES : [...FILES].reverse()), [orientation]);
  const ranks = useMemo(() => (orientation === 'w' ? [...RANKS].reverse() : RANKS), [orientation]);

  const squareFromClientPoint = useCallback(
    (boardEl: HTMLElement, clientX: number, clientY: number): Square | null => {
      const rect = boardEl.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const fileIdx = Math.max(0, Math.min(7, Math.floor((x / rect.width) * 8)));
      const rankFromTop = Math.max(0, Math.min(7, Math.floor((y / rect.height) * 8)));

      const file = orientation === 'w' ? fileIdx : 7 - fileIdx;
      const rank = orientation === 'w' ? 7 - rankFromTop : rankFromTop;

      return makeSquare(file, rank);
    },
    [orientation]
  );

  return { displaySquares, displayIndexBySquare, files, ranks, squareFromClientPoint };
}
