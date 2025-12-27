import { useCallback, useMemo } from 'react';

import type { GameState, Move, Square } from '../../domain/chessTypes';
import { getPiece } from '../../domain/board';
import { fileOf, rankOf } from '../../domain/square';

function isDarkSquare(square: Square): boolean {
  // Convention: a1 is dark.
  return (fileOf(square) + rankOf(square)) % 2 === 0;
}

export type BoardHighlights = {
  getSquareClass: (sq: Square) => string;
  isLegalDestination: (sq: Square) => boolean;
};

export function useBoardHighlights(args: {
  state: GameState;
  selectedSquare: Square | null;
  legalMoves: Move[];
  hintMove?: { from: Square; to: Square } | null;
  lastMove?: { from: Square; to: Square } | null;
  checkSquares?: Square[];
}): BoardHighlights {
  const { state, selectedSquare, legalMoves, hintMove, lastMove, checkSquares } = args;

  const { legalDestinations, captureDestinations } = useMemo(() => {
    const legal = new Set<Square>();
    const capture = new Set<Square>();

    for (const m of legalMoves) {
      legal.add(m.to);
      const targetPiece = getPiece(state.board, m.to);
      const isCapture = Boolean(targetPiece) || Boolean(m.isEnPassant);
      if (isCapture) capture.add(m.to);
    }

    return { legalDestinations: legal, captureDestinations: capture };
  }, [legalMoves, state.board]);

  const checkSet = useMemo(() => new Set<Square>(checkSquares ?? []), [checkSquares]);
  const hintFrom = hintMove ? hintMove.from : null;
  const hintTo = hintMove ? hintMove.to : null;
  const lastFrom = lastMove ? lastMove.from : null;
  const lastTo = lastMove ? lastMove.to : null;

  const isLegalDestination = useCallback((sq: Square) => legalDestinations.has(sq), [legalDestinations]);

  const getSquareClass = useCallback(
    (sq: Square) => {
      const isSelected = selectedSquare === sq;
      const isLegal = legalDestinations.has(sq);
      const isCapture = captureDestinations.has(sq);
      const isDark = isDarkSquare(sq);
      const isLastFrom = lastFrom === sq;
      const isLastTo = lastTo === sq;
      const isCheck = checkSet.has(sq);
      const isHintFrom = hintFrom === sq;
      const isHintTo = hintTo === sq;

      return [
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
    },
    [captureDestinations, checkSet, hintFrom, hintTo, lastFrom, lastTo, legalDestinations, selectedSquare]
  );

  return { getSquareClass, isLegalDestination };
}
