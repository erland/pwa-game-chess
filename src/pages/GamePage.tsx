import { useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createInitialGameState } from '../domain/gameState';
import { getCapturedPiecesFromState } from '../domain/material/captured';
import { gameReducer } from '../domain/reducer';

import { useDerivedGameView } from './game/useDerivedGameView';
import { useLocalClocks } from './game/useLocalClocks';
import { useToastNotice } from './game/useToastNotice';
import { useAiController } from './game/useAiController';
import { useGameSetup } from './game/useGameSetup';
import { useHintController } from './game/useHintController';
import { useGameRecording } from './game/useGameRecording';

import { GamePageView } from './game/GamePageView';
import {
  useGameInteractionController,
  type ConfirmState,
  type PendingPromotion
} from './game/useGameInteractionController';

export function GamePage() {
  const navigate = useNavigate();

  const {
    mode,
    timeControl,
    orientation,
    gameId,
    restartId,
    playerSideChoice,
    difficulty,
    playerColor,
    aiColor,
    aiConfig,
    ai,
    setupPath,
    setupLabel,
    players,
    recordedMode,
    recordedTimeControl
  } = useGameSetup();

  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialGameState());

  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const { status, isGameOver, inCheck, lastMove, checkSquares } = useDerivedGameView(state);
  const { noticeText, showNotice, clearNotice } = useToastNotice(1500);

  const capturedPieces = useMemo(() => getCapturedPiecesFromState(state, 'w'), [state]);

  const { commitMove } = useGameRecording({
    gameId,
    recordedMode,
    players,
    recordedTimeControl,
    isGameOver,
    status,
    history: state.history,
    dispatch
  });

  const { hasClock, clock } = useLocalClocks(state, timeControl ?? { kind: 'none' }, isGameOver, dispatch);

  // Hint controller is created after AI controller, but AI needs a stable reference to clear hints.
  const clearHintRef = useRef<(() => void) | null>(null);

  const aiCtl = useAiController({
    enabled: mode === 'vsComputer',
    state,
    isGameOver,
    aiColor,
    ai,
    config: aiConfig,
    onApplyMove: (move) => {
      clearHintRef.current?.();
      commitMove(move);
    },
    onError: (msg) => showNotice(msg)
  });

  const hint = useHintController({
    enabled: mode === 'vsComputer',
    state,
    isGameOver,
    playerColor,
    aiConfig,
    blocked: Boolean(pendingPromotion) || Boolean(confirm),
    aiIsThinking: aiCtl.isThinking,
    showNotice
  });
  clearHintRef.current = hint.clearHint;

  const interaction = useGameInteractionController({
    mode,
    state,
    isGameOver,
    playerColor,
    aiColor,
    aiIsThinking: aiCtl.isThinking,
    cancelAi: aiCtl.cancel,
    hint: {
      isHintThinking: hint.isHintThinking,
      hintMove: hint.hintMove,
      hintText: hint.hintText
    },
    clearHint: hint.clearHint,
    requestHint: hint.requestHint,
    showNotice,
    clearNotice,
    commitMove,
    dispatch,
    restartId,
    pendingPromotion,
    setPendingPromotion,
    confirm,
    setConfirm
  });

  const setupMissing = !timeControl || !orientation;

  return (
    <GamePageView
      setupMissing={setupMissing}
      mode={mode}
      timeControl={timeControl}
      orientation={orientation}
      gameId={gameId}
      setupPath={setupPath}
      setupLabel={setupLabel}
      playerColor={playerColor}
      aiColor={aiColor}
      playerSideChoice={playerSideChoice}
      difficulty={difficulty}
      aiConfig={aiConfig}
      state={state}
      status={status}
      inCheck={inCheck}
      isGameOver={isGameOver}
      lastMove={lastMove}
      checkSquares={checkSquares}
      capturedPieces={capturedPieces}
      hasClock={hasClock}
      clock={clock}
      aiIsThinking={aiCtl.isThinking}
      hint={{
        isHintThinking: hint.isHintThinking,
        hintMove: hint.hintMove,
        hintText: hint.hintText
      }}
      noticeText={noticeText}
      interaction={interaction}
      onNewGame={() => navigate(setupPath)}
      onHome={() => navigate('/')}
    />
  );
}
