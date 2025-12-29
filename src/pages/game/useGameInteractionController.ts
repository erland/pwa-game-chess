import { useEffect, useState } from 'react';

import type { GameState, Move, Square } from '../../domain/chessTypes';
import { useMoveInput, type PendingPromotion as MoveInputPendingPromotion } from '../../ui/chessboard/useMoveInput';
import type { GameAction } from '../../domain/reducer';

export type PendingPromotion = MoveInputPendingPromotion;

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

  const moveInput = useMoveInput({
    state,
    selectedSquare,
    setSelectedSquare,
    pendingPromotion,
    setPendingPromotion,
    // Additional constraints (AI thinking / confirm dialogs) are enforced by wrappers below.
    disabled: false,
    onMove: (move) => {
      if (hint.isHintThinking || hint.hintMove || hint.hintText) clearHint();
      commitMove(move);
    },
    showNotice
  });

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
    moveInput.clearSelection();
  }

  function handleSquareClick(square: Square) {
    if (isGameOver) return;
    if (mode === 'vsComputer' && state.sideToMove === aiColor) return;
    if (aiIsThinking) return;
    if (pendingPromotion) return;
    if (confirm) return;

    moveInput.handleSquareClick(square);
  }

  function handleMoveAttempt(from: Square, to: Square, candidates: Move[]) {
    if (isGameOver) return;
    if (hint.isHintThinking || hint.hintMove || hint.hintText) clearHint();
    if (mode === 'vsComputer' && state.sideToMove === aiColor) return;
    if (aiIsThinking) return;
    if (pendingPromotion) return;
    if (confirm) return;

    moveInput.handleMoveAttempt(from, to, candidates);
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
    moveInput.choosePromotion(move);
  }

  function cancelPromotion() {
    moveInput.cancelPromotion();
  }

  return {
    selectedSquare: moveInput.selectedSquare,
    legalMovesFromSelection: moveInput.legalMovesFromSelection,
    pendingPromotion: moveInput.pendingPromotion,
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
