import type { TrainingItemStats } from '../../storage/training/trainingStore';
import { recordAttempt } from '../../storage/training/trainingStore';

import type { OpeningNodeStats } from '../../storage/training/openingNodeStore';
import { recordOpeningNodeAttempt } from '../../storage/training/openingNodeStore';

import type { TrainingMistakeRecord, TrainingSessionRecord } from '../../storage/training/trainingSessionStore';
import {
  addTrainingMistake,
  makeMistakeId,
  makeSessionId,
  saveTrainingSession
} from '../../storage/training/trainingSessionStore';

import type { TrainingItemKey } from '../../domain/training/keys';

/**
 * Storage-facing helpers for training progress.
 *
 * Controllers should prefer calling these wrappers instead of importing multiple stores.
 */

export async function recordTrainingItemAttempt(args: {
  packId: string;
  itemId: string;
  success: boolean;
  solveMs: number;
  nowMs?: number;
}): Promise<TrainingItemStats> {
  return recordAttempt({
    packId: args.packId,
    itemId: args.itemId,
    success: args.success,
    solveMs: args.solveMs,
    nowMs: args.nowMs
  });
}

export async function recordOpeningNodeAttemptProgress(args: {
  key: string;
  packId: string;
  itemId: string;
  plyIndex: number;
  success: boolean;
  solveMs: number;
}): Promise<OpeningNodeStats> {
  return recordOpeningNodeAttempt({
    key: args.key,
    packId: args.packId,
    itemId: args.itemId,
    plyIndex: args.plyIndex,
    success: args.success,
    solveMs: args.solveMs
  });
}

export async function saveSessionWithMistakes(record: TrainingSessionRecord, mistakes: TrainingMistakeRecord[]): Promise<void> {
  await saveTrainingSession(record);
  for (const m of mistakes) {
    await addTrainingMistake(m);
  }
}

export async function persistEndgameFinish(args: {
  key: TrainingItemKey;
  packId: string;
  itemId: string;
  fen: string;
  success: boolean;
  solveMs: number;
  startedAtMs: number;
  endedAtMs: number;
  totalCpLoss: number;
  gradedMoves: number;
  gradeCounts: Record<string, number>;
  playedLineUci: string[];
  message: string;
}): Promise<{ nextStats: TrainingItemStats | null; sessionId: string }>
{
  // Even if persistence fails we still create a deterministic id so the UI can keep working.
  const sessionId = makeSessionId();

  // 1) Update spaced repetition stats (best-effort).
  let nextStats: TrainingItemStats | null = null;
  try {
    nextStats = await recordTrainingItemAttempt({
      packId: args.packId,
      itemId: args.itemId,
      success: args.success,
      solveMs: args.solveMs,
      nowMs: args.endedAtMs
    });
  } catch {
    // ignore
  }

  // 2) Save session summary (best-effort).
  const avgCpLoss = args.gradedMoves > 0 ? Math.round(args.totalCpLoss / args.gradedMoves) : 0;
  const record: TrainingSessionRecord = {
    id: sessionId,
    mode: 'endgames',
    startedAtMs: args.startedAtMs,
    endedAtMs: args.endedAtMs,
    attempted: 1,
    correct: args.success ? 1 : 0,
    totalSolveMs: args.solveMs,
    avgSolveMs: args.solveMs,
    totalCpLoss: args.totalCpLoss,
    avgCpLoss,
    gradeCounts: args.gradeCounts,
    packIds: [args.packId]
  };

  try {
    await saveTrainingSession(record);
  } catch {
    // ignore
  }

  // 3) Save mistake on failure (best-effort).
  if (!args.success) {
    const mistake: TrainingMistakeRecord = {
      id: makeMistakeId(sessionId, args.key, args.endedAtMs),
      sessionId,
      itemKey: args.key,
      packId: args.packId,
      itemId: args.itemId,
      fen: args.fen,
      expectedLineUci: [],
      playedLineUci: args.playedLineUci,
      solveMs: args.solveMs,
      createdAtMs: args.endedAtMs,
      message: args.message
    };

    try {
      await addTrainingMistake(mistake);
    } catch {
      // ignore
    }
  }

  return { nextStats, sessionId };
}
