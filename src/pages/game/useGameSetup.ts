import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import type { Color } from '../../domain/chessTypes';
import { oppositeColor } from '../../domain/chessTypes';
import { parseGameModeParam, type GameMode } from '../../domain/gameMode';
import { parseOrientationParam, parseTimeControlParam } from '../../domain/localSetup';
import { aiConfigFromDifficulty } from '../../domain/ai/presets';
import type { ChessAi } from '../../domain/ai/types';
import { HeuristicBot } from '../../domain/ai/heuristicBot';
import { StrongEngineBot } from '../../domain/ai/strongEngineBot';
import { parseDifficultyParam, parseSideChoiceParam } from '../../domain/vsComputerSetup';
import { WorkerEngineAi, isWorkerEngineSupported } from './workerEngineAi';
import type { Players, RecordedGameMode, TimeControl as RecordedTimeControl } from '../../domain/recording/types';

function makeGameId(mode: GameMode): string {
  const prefix = mode === 'local' ? 'local' : 'vs';
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function parseIntParam(param: string | null): number | null {
  if (param == null) return null;
  const n = Number.parseInt(param, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatParam(param: string | null): number | null {
  if (param == null) return null;
  const n = Number.parseFloat(param);
  return Number.isFinite(n) ? n : null;
}

export type GameSetup = {
  mode: GameMode;
  timeControl: ReturnType<typeof parseTimeControlParam>;
  orientation: ReturnType<typeof parseOrientationParam>;
  gameId: string;
  restartId: () => void;

  // vs-computer params
  playerSideChoice: ReturnType<typeof parseSideChoiceParam>;
  difficulty: ReturnType<typeof parseDifficultyParam>;
  playerColor: Color;
  aiColor: Color;
  aiConfig: ReturnType<typeof aiConfigFromDifficulty>;
  ai: ChessAi | null;

  // convenience
  setupPath: string;
  setupLabel: string;
  players: Players;
  recordedMode: RecordedGameMode;
  recordedTimeControl: RecordedTimeControl;
};

/**
 * Centralizes URL param parsing + derived setup values.
 * Keeps side effects (like AI lifecycle) out of the GamePage component.
 */
export function useGameSetup(): GameSetup {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const modeFromParam = parseGameModeParam(searchParams.get('m'));
  const mode: GameMode = modeFromParam ?? (location.pathname.startsWith('/vs-computer') ? 'vsComputer' : 'local');

  const playerSideChoice = parseSideChoiceParam(searchParams.get('side')) ?? 'w';
  const difficulty = parseDifficultyParam(searchParams.get('d')) ?? 'easy';

  const customThinkTimeMs = parseIntParam(searchParams.get('tt'));
  const customRandomness = parseFloatParam(searchParams.get('rn'));
  const customMaxDepth = parseIntParam(searchParams.get('md'));

  const timeControlParam = searchParams.get('tc');
  const orientationParam = searchParams.get('o');

  // Keep parsed setup values referentially stable across renders.
  const timeControl = useMemo(() => parseTimeControlParam(timeControlParam), [timeControlParam]);
  const orientation = useMemo(() => parseOrientationParam(orientationParam), [orientationParam]);

  const [gameId, setGameId] = useState(() => makeGameId(mode));

  // If the user navigates between modes while staying on the page, ensure the id resets.
  useEffect(() => {
    setGameId(makeGameId(mode));
  }, [mode]);

  const restartId = () => setGameId(makeGameId(mode));

  // In vs-computer mode, the player may choose "Random"; resolve it once per game id.
  const playerColor: Color = useMemo(() => {
    if (playerSideChoice === 'r') return Math.random() < 0.5 ? 'w' : 'b';
    return playerSideChoice;
  }, [playerSideChoice, gameId]);

  const aiColor: Color = useMemo(() => oppositeColor(playerColor), [playerColor]);

  const aiConfig = useMemo(() => {
    if (difficulty !== 'custom') return aiConfigFromDifficulty(difficulty);
    return aiConfigFromDifficulty('custom', undefined, {
      thinkTimeMs: customThinkTimeMs ?? undefined,
      randomness: customRandomness ?? undefined,
      maxDepth: customMaxDepth ?? undefined
    });
  }, [difficulty, customThinkTimeMs, customRandomness, customMaxDepth]);

  // v2 Step 7: choose AI implementation.
  const ai: ChessAi | null = useMemo(() => {
    if (mode !== 'vsComputer') return null;

    const wantsStrong = difficulty === 'hard' || (difficulty === 'custom' && (aiConfig.maxDepth ?? 1) >= 3);
    if (!wantsStrong) return new HeuristicBot();

    if (isWorkerEngineSupported()) return new WorkerEngineAi();
    return new StrongEngineBot();
  }, [mode, difficulty, aiConfig.maxDepth]);

  // Ensure we init/dispose AI implementations that need lifecycle.
  useEffect(() => {
    void ai?.init?.();
    return () => {
      void ai?.dispose?.();
    };
  }, [ai]);

  const setupPath = mode === 'vsComputer' ? '/vs-computer/setup' : '/local/setup';
  const setupLabel = mode === 'vsComputer' ? 'Go to vs computer setup' : 'Go to local setup';

  const players: Players = useMemo(() => {
    if (mode === 'local') return { white: 'White', black: 'Black' };
    return playerColor === 'w' ? { white: 'You', black: 'Computer' } : { white: 'Computer', black: 'You' };
  }, [mode, playerColor]);

  const recordedMode: RecordedGameMode = mode === 'local' ? 'local' : 'vsComputer';
  const recordedTimeControl: RecordedTimeControl = timeControl ?? { kind: 'none' };

  return {
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
  };
}
