import type { Color, GameState, Move, Square } from '../chessTypes';

export type CoachConfig = {
  /** Search depth budget (small integer, e.g. 2..6). */
  maxDepth?: number;
  /** Time budget (ms). Engines may treat as a soft deadline. */
  thinkTimeMs?: number;
};

/** Result of a single position analysis. */
export type CoachAnalysis = {
  /** Perspective used for scoreCp (positive means better for this color). */
  perspective: Color;
  /** Side to move in the analyzed position. */
  sideToMove: Color;

  /** Centipawn evaluation from `perspective`. */
  scoreCp?: number;
  /** Mate distance if known (engine-specific). */
  mateIn?: number;

  /** Best move for sideToMove, encoded as UCI. */
  bestMoveUci?: string;
  /** Principal variation (UCI moves), typically starting with bestMoveUci. */
  pv?: string[];

  // Debug/telemetry
  depth?: number;
  nodes?: number;
  timeMs?: number;
};

export type CoachGradeLabel = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export type CoachMoveGrade = {
  label: CoachGradeLabel;
  /** Centipawn loss (>= 0). */
  cpLoss: number;
  bestMoveUci?: string;
  playedMoveUci?: string;
  bestScoreCp?: number;
  playedScoreCp?: number;
};

export type ProgressiveHintLevel = 1 | 2 | 3;

export type CoachHint =
  | {
      level: 1;
      kind: 'nudge';
      from?: Square;
      to?: Square;
    }
  | {
      level: 2;
      kind: 'move';
      moveUci: string;
      from: Square;
      to: Square;
    }
  | {
      level: 3;
      kind: 'line';
      pv: string[];
    };

export interface Coach {
  analyze(state: GameState, perspective: Color, config: CoachConfig, signal: AbortSignal): Promise<CoachAnalysis>;
  gradeMove(before: GameState, move: Move, config: CoachConfig, signal: AbortSignal): Promise<CoachMoveGrade>;
}
