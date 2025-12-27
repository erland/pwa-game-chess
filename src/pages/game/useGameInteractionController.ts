import { useEffect, useMemo, useState } from 'react';

import type { GameState, Move, Square } from '../../domain/chessTypes';
import { getPiece } from '../../domain/board';
import { generateLegalMoves } from '../../domain/legalMoves';
import { generatePseudoLegalMoves } from '../../domain/movegen';
import type { GameAction } from '../../domain/reducer';

export type PendingPromotion = {
  from: Square;
  to: Square;
  options: Move[];
};

export type ConfirmState =
  | { kind: 'resign'; title: string; message: string }
  | { kind: 'draw'; title: string; message: string }
  | null;

export type HintUiState = {
  isHintThinking: boolean;
  hintMove: Move | null;
  hintText: string | null;
};

export type GameInteractionController = {
  selectedSquare: Square | null;
  legalMovesFromSelection: Move[];
  pendingPromotion: PendingPromotion | null;
  confirm: ConfirmState;

  handleSquareClick: (square: Square) => void;
  handleMoveAttempt: (from: Square, to: Square, candidates: Move[]) => void;

  restart: () => void;
  toggleHint: () => void;

  askOfferDraw: () => void;
  askResign: () => void;

  cancelConfirm: () => void;
  confirmAction: () => void;

  choosePromotion: (move: Move) => void;
  cancelPromotion: () => void;

  clearSelection: () => void;
};

export function useGameInteractionController(args: {
  mode: 'local' | 'vsComputer';
  state: GameState;
  isGameOver: boolean;

  playerColor: GameState['sideToMove'];
  aiColor: GameState['sideToMove'];

  aiIsThinking: boolean;
  cancelAi: () => void;

  hint: HintUiState;
  clearHint: () => void;
  requestHint: () => void;

  showNotice: (message: string) => void;
  clearNotice: () => void;

  commitMove: (move: Move) => void;
  dispatch: (action: GameAction) => void;
  restartId: () => void;

  pendingPromotion: PendingPromotion | null;
  setPendingPromotion: (value: PendingPromotion | null) => void;

  confirm: ConfirmState;
  setConfirm: (value: ConfirmState) => void;
}): GameInteractionController {
  const {
    mode,
    state,
    isGameOver,
    playerColor,
    aiColor,
    aiIsThinking,
    cancelAi,
    hint,
    clearHint,
    requestHint,
    showNotice,
    clearNotice,
    commitMove,
    dispatch,
    restartId,
    pendingPromotion,
    setPendingPromotion,
    confirm,
    setConfirm
  } = args;

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  const legalMovesFromSelection = useMemo(() => {
    if (selectedSquare === null) return [];
    return generateLegalMoves(state, selectedSquare);
  }, [state, selectedSquare]);

  // Close in-progress input dialogs if the game ends (mate/draw/resign).
  useEffect(() => {
    if (!isGameOver) return;
    setConfirm(null);
    setPendingPromotion(null);
    setSelectedSquare(null);
    clearHint();
    clearNotice();
  }, [isGameOver, clearHint, clearNotice, setConfirm, setPendingPromotion]);

  function clearSelection() {
    setSelectedSquare(null);
  }

  function tryApplyCandidates(from: Square, to: Square, candidates: Move[]) {
    if (hint.isHintThinking || hint.hintMove || hint.hintText) clearHint();

    // Promotions generate multiple legal moves for the same (from,to) with different piece types.
    const promo = candidates.filter((m) => m.promotion);
    if (promo.length > 0) {
      // Let the user choose what to promote to.
      setPendingPromotion({ from, to, options: promo });
      return;
    }

    // Non-promotion: there should be exactly one legal candidate.
    if (candidates.length > 0) {
      commitMove(candidates[0]);
      setSelectedSquare(null);
    }
  }

  function handleSquareClick(square: Square) {
    if (isGameOver) return;
    if (mode === 'vsComputer' && state.sideToMove === aiColor) return;
    if (aiIsThinking) return;
    if (pendingPromotion) return;
    if (confirm) return;

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

    // If click another own piece, switch selection.
    if (isOwnPiece) {
      setSelectedSquare(square);
      return;
    }

    const from = selectedSquare;
    const candidates = generateLegalMoves(state, from).filter((m) => m.to === square);

    if (candidates.length === 0) {
      const pseudo = generatePseudoLegalMoves(state, from).filter((m) => m.to === square);
      showNotice(pseudo.length > 0 ? 'King would be in check' : 'Illegal move');
      return;
    }

    tryApplyCandidates(from, square, candidates);
  }

  function handleMoveAttempt(from: Square, to: Square, candidates: Move[]) {
    if (isGameOver) return;
    if (hint.isHintThinking || hint.hintMove || hint.hintText) clearHint();
    if (mode === 'vsComputer' && state.sideToMove === aiColor) return;
    if (aiIsThinking) return;
    if (pendingPromotion) return;
    if (confirm) return;

    // Drag-drop is allowed even if selection is out of sync.
    if (candidates.length === 0) {
      const pseudo = generatePseudoLegalMoves(state, from).filter((m) => m.to === to);
      showNotice(pseudo.length > 0 ? 'King would be in check' : 'Illegal move');
      setSelectedSquare(from);
      return;
    }

    tryApplyCandidates(from, to, candidates);
  }

  function restart() {
    cancelAi();
    clearHint();
    dispatch({ type: 'newGame' });
    restartId();
    setSelectedSquare(null);
    setPendingPromotion(null);
  }

  function toggleHint() {
    if (hint.isHintThinking || hint.hintText) {
      clearHint();
    } else {
      void requestHint();
    }
  }

  function askOfferDraw() {
    setConfirm({ kind: 'draw', title: 'Offer draw', message: 'Offer a draw and accept it immediately?' });
  }

  function askResign() {
    setConfirm({
      kind: 'resign',
      title: 'Resign',
      message:
        mode === 'vsComputer'
          ? `Resign as ${playerColor === 'w' ? 'White' : 'Black'}?`
          : `Resign as ${state.sideToMove === 'w' ? 'White' : 'Black'}?`
    });
  }

  function cancelConfirm() {
    setConfirm(null);
  }

  function confirmAction() {
    if (!confirm) return;
    cancelAi();
    clearHint();

    if (confirm.kind === 'resign') {
      dispatch({ type: 'resign', loser: mode === 'vsComputer' ? playerColor : undefined });
    } else {
      dispatch({ type: 'agreeDraw' });
    }

    setConfirm(null);
    setSelectedSquare(null);
    setPendingPromotion(null);
  }

  function choosePromotion(move: Move) {
    clearHint();
    commitMove(move);
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
    confirm,

    handleSquareClick,
    handleMoveAttempt,

    restart,
    toggleHint,

    askOfferDraw,
    askResign,

    cancelConfirm,
    confirmAction,

    choosePromotion,
    cancelPromotion,

    clearSelection
  };
}
