import type { Color, Move, PieceType, Square } from '../chessTypes';

/**
 * v3 Step 1: durable game records for local history/review (backend-free).
 *
 * Keep these types JSON-serializable and stable for future versions.
 */

export type RecordedGameMode = 'local' | 'vsComputer';

/**
 * Persisted time control.
 *
 * Mirrors src/domain/localSetup.ts but is defined here so the recording layer
 * stays self-contained and backend/transport friendly.
 */
export type TimeControl =
  | { kind: 'none' }
  | { kind: 'fischer'; initialSeconds: number; incrementSeconds: number };

export type Players = {
  white: string;
  black: string;
};

export type MoveRecord = {
  from: Square;
  to: Square;
  promotion?: Exclude<PieceType, 'k' | 'p'>;
};

export type GameResult = {
  /** '1-0', '0-1', or '1/2-1/2' */
  result: '1-0' | '0-1' | '1/2-1/2';
  termination:
    | 'checkmate'
    | 'stalemate'
    | 'drawInsufficientMaterial'
    | 'drawAgreement'
    | 'resign'
    | 'timeout';
  winner?: Color;
  loser?: Color;
};

export type GameRecord = {
  id: string;
  mode: RecordedGameMode;
  players: Players;
  timeControl: TimeControl;
  startedAtMs: number;
  finishedAtMs: number;

  /** Optional initial position for future compatibility (FEN). */
  initialFen?: string | null;

  moves: MoveRecord[];
  result: GameResult;
};

/** Convenience helper: canonicalize a domain Move to a persisted MoveRecord. */
export function toMoveRecord(move: Move): MoveRecord {
  return {
    from: move.from,
    to: move.to,
    promotion: move.promotion
  };
}
