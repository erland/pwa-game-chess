import type { GameStatus, Move } from '../chessTypes';
import type { GameRecord, GameResult, Players, RecordedGameMode, TimeControl } from './types';
import { toMoveRecord } from './types';

export type RecordingSessionMeta = {
  id: string;
  mode: RecordedGameMode;
  players: Players;
  timeControl: TimeControl;
  startedAtMs: number;
  initialFen?: string | null;
};

export type RecordingFinalizeMeta = {
  status: Exclude<GameStatus, { kind: 'inProgress' }>;
  finishedAtMs: number;
  /** Optional safety fallback if a caller missed recording some moves. */
  fallbackHistory?: Move[];
};

export type GameRecorder = {
  recordMove: (move: Move) => void;
  finalize: (meta: RecordingFinalizeMeta) => GameRecord;
  getMoveCount: () => number;
};

function toResult(status: Exclude<GameStatus, { kind: 'inProgress' }>): GameResult {
  switch (status.kind) {
    case 'checkmate':
      return { result: status.winner === 'w' ? '1-0' : '0-1', termination: 'checkmate', winner: status.winner };
    case 'stalemate':
      return { result: '1/2-1/2', termination: 'stalemate' };
    case 'drawInsufficientMaterial':
      return { result: '1/2-1/2', termination: 'drawInsufficientMaterial' };
    case 'drawAgreement':
      return { result: '1/2-1/2', termination: 'drawAgreement' };
    case 'timeout':
      return {
        result: status.winner === 'w' ? '1-0' : '0-1',
        termination: 'timeout',
        winner: status.winner,
        loser: status.loser
      };
    case 'resign':
      return {
        result: status.winner === 'w' ? '1-0' : '0-1',
        termination: 'resign',
        winner: status.winner,
        loser: status.loser
      };
  }
}

/**
 * Start a new append-only recording session.
 *
 * The recorder is intentionally dumb: callers must invoke recordMove() whenever
 * a move is committed to game state.
 */
export function startRecording(meta: RecordingSessionMeta): GameRecorder {
  const session: RecordingSessionMeta = { ...meta };
  const moves: Move[] = [];

  return {
    recordMove(move) {
      moves.push({ ...move });
    },
    getMoveCount() {
      return moves.length;
    },
    finalize({ status, finishedAtMs, fallbackHistory }) {
      // Canonical persisted record uses MoveRecord (from/to/promotion only).
      const primary = moves.map(toMoveRecord);
      const fallback = (fallbackHistory ?? []).map(toMoveRecord);

      // If something went wrong and the counts diverge, prefer the game state's
      // authoritative history. This keeps us resilient to future refactors.
      const chosen = fallback.length > 0 && fallback.length !== primary.length ? fallback : primary;

      return {
        id: session.id,
        mode: session.mode,
        players: session.players,
        timeControl: session.timeControl,
        startedAtMs: session.startedAtMs,
        finishedAtMs,
        initialFen: session.initialFen ?? null,
        moves: chosen,
        result: toResult(status)
      };
    }
  };
}
