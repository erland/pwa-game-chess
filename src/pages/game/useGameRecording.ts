import { useEffect, useRef, type Dispatch } from 'react';

import type { GameStatus, Move } from '../../domain/chessTypes';
import type { GameAction } from '../../domain/reducer';
import { startRecording, type GameRecorder } from '../../domain/recording/recording';
import type { Players, RecordedGameMode, TimeControl as RecordedTimeControl } from '../../domain/recording/types';
import { putGame } from '../../storage/gamesDb';

export function useGameRecording(opts: {
  gameId: string;
  recordedMode: RecordedGameMode;
  players: Players;
  recordedTimeControl: RecordedTimeControl;
  isGameOver: boolean;
  status: GameStatus;
  history: Move[];
  dispatch: Dispatch<GameAction>;
}) {
  const {
    gameId,
    recordedMode,
    players,
    recordedTimeControl,
    isGameOver,
    status,
    history,
    dispatch
  } = opts;

  const recorderRef = useRef<GameRecorder | null>(null);
  const persistedGameIdRef = useRef<string | null>(null);

  // Start a fresh recorder whenever a new game id is created.
  useEffect(() => {
    recorderRef.current = startRecording({
      id: gameId,
      mode: recordedMode,
      players,
      timeControl: recordedTimeControl,
      startedAtMs: Date.now(),
      initialFen: null
    });
    persistedGameIdRef.current = null;
  }, [gameId, recordedMode, players, recordedTimeControl]);

  // Persist a finished game once (durably) when it ends.
  useEffect(() => {
    if (!isGameOver) return;
    if (persistedGameIdRef.current === gameId) return;

    // Only persist if we have a terminal status.
    if (status.kind === 'inProgress') return;

    persistedGameIdRef.current = gameId;

    const recorder = recorderRef.current;
    if (!recorder) return;

    const record = recorder.finalize({
      status: status,
      finishedAtMs: Date.now(),
      // Fallback for robustness.
      fallbackHistory: history
    });

    // Best-effort write; errors should not break gameplay.
    void putGame(record).catch(() => {
      // ignored (e.g. quota issues)
    });
  }, [isGameOver, gameId, status, history]);

  const commitMove = (move: Move) => {
    recorderRef.current?.recordMove(move);
    dispatch({ type: 'applyMove', move });
  };

  return { commitMove };
}
