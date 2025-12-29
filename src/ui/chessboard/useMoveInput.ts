import { useMemo } from 'react';

import type { GameState, Move, Square } from '../../domain/chessTypes';
import { getPiece } from '../../domain/board';
import { generateLegalMoves } from '../../domain/legalMoves';
import { generatePseudoLegalMoves } from '../../domain/movegen';

export type PendingPromotion = {
  from: Square;
  to: Square;
  options: Move[];
};

export type IllegalMoveNoticeMode = 'none' | 'basic' | 'pseudo';

export type MoveInputController = {
  selectedSquare: Square | null;
  legalMovesFromSelection: Move[];
  pendingPromotion: PendingPromotion | null;

  handleSquareClick: (square: Square) => void;
  handleMoveAttempt: (from: Square, to: Square, candidates: Move[]) => void;

  choosePromotion: (move: Move) => void;
  cancelPromotion: () => void;

  clearSelection: () => void;
};

/**
 * Shared chess move-input logic used across game + training pages.
 *
 * Responsibilities:
 * - selection toggling (tap/click)
 * - validation + illegal move notices (optional)
 * - promotion branching (choose among candidate promotion moves)
 *
 * Not responsible for:
 * - applying the move to state (caller supplies `onMove`)
 * - game-mode rules (AI thinking, confirmations, etc.) → use `disabled`
 */
export function useMoveInput(args: {
  state: GameState;

  selectedSquare: Square | null;
  setSelectedSquare: (value: Square | null) => void;

  pendingPromotion: PendingPromotion | null;
  setPendingPromotion: (value: PendingPromotion | null) => void;

  disabled?: boolean;
  onMove: (move: Move) => void;

  showNotice?: (message: string) => void;
  illegalNoticeMode?: IllegalMoveNoticeMode;
}): MoveInputController {
  const {
    state,
    selectedSquare,
    setSelectedSquare,
    pendingPromotion,
    setPendingPromotion,
    disabled,
    onMove,
    showNotice,
    illegalNoticeMode = 'pseudo'
  } = args;

  const legalMovesFromSelection = useMemo(() => {
    if (selectedSquare === null) return [] as Move[];
    return generateLegalMoves(state, selectedSquare);
  }, [state, selectedSquare]);

  function clearSelection() {
    setSelectedSquare(null);
  }

  function showIllegalMove(from: Square, to: Square) {
    if (!showNotice) return;
    if (illegalNoticeMode === 'none') return;
    if (illegalNoticeMode === 'basic') {
      showNotice('Illegal move');
      return;
    }

    // 'pseudo': distinguish "would leave king in check" vs "not even pseudo-legal".
    const pseudo = generatePseudoLegalMoves(state, from).filter((m) => m.to === to);
    showNotice(pseudo.length > 0 ? 'King would be in check' : 'Illegal move');
  }

  function tryApplyCandidates(from: Square, to: Square, candidates: Move[]) {
    // Promotions generate multiple legal moves for the same (from,to) with different piece types.
    const promo = candidates.filter((m) => m.promotion);
    if (promo.length > 0) {
      setPendingPromotion({ from, to, options: promo });
      return;
    }

    if (candidates.length > 0) {
      onMove(candidates[0]);
      setSelectedSquare(null);
    }
  }

  function handleSquareClick(square: Square) {
    if (disabled) return;
    if (pendingPromotion) return;

    const piece = getPiece(state.board, square);
    const isOwnPiece = piece != null && piece.color === state.sideToMove;

    if (selectedSquare === null) {
      if (isOwnPiece) setSelectedSquare(square);
      return;
    }

    // Toggle off selection.
    if (square === selectedSquare) {
      setSelectedSquare(null);
      return;
    }

    // Switch selection to another own piece.
    if (isOwnPiece) {
      setSelectedSquare(square);
      return;
    }

    const from = selectedSquare;
    const candidates = generateLegalMoves(state, from).filter((m) => m.to === square);
    if (candidates.length === 0) {
      showIllegalMove(from, square);
      return;
    }

    tryApplyCandidates(from, square, candidates);
  }

  function handleMoveAttempt(from: Square, to: Square, candidates: Move[]) {
    if (disabled) return;
    if (pendingPromotion) return;

    if (candidates.length === 0) {
      showIllegalMove(from, to);
      setSelectedSquare(from);
      return;
    }

    tryApplyCandidates(from, to, candidates);
  }

  function choosePromotion(move: Move) {
    onMove(move);
    setPendingPromotion(null);
    setSelectedSquare(null);
  }

  function cancelPromotion() {
    setPendingPromotion(null);
    // Keep selection so the user can try again.
  }

  return {
    selectedSquare,
    legalMovesFromSelection,
    pendingPromotion,
    handleSquareClick,
    handleMoveAttempt,
    choosePromotion,
    cancelPromotion,
    clearSelection
  };
}
