import type { Square, Color, Move } from '../../chessTypes';
import type { TrainingPack, TacticItem } from '../schema';
import type { CoachAnalysis, CoachHint, CoachMoveGrade, ProgressiveHintLevel } from '../../coach/types';
import type { fromFEN } from '../../notation/fen';

export type TacticRef = {
  pack: TrainingPack;
  item: TacticItem;
};

export type TacticsAttemptState = {
  ref: TacticRef;
  attemptToken: string;
  baseState: ReturnType<typeof fromFEN>;
  state: ReturnType<typeof fromFEN>;
  userColor: Color;
  /** All solution lines (normalized UCI), from the pack item. */
  solutionLines: string[][];
  /** The chosen line after the first correct move (supports alternative first moves). */
  activeLine: string[] | null;
  /** Next expected ply index into activeLine (or solutionLines during the first move). */
  ply: number;
  /** Played line so far (including auto-played opponent replies). */
  playedLineUci: string[];
  /** Grades for each user move in this attempt (best-effort). */
  userMoveGrades: CoachMoveGrade[];
  startedAtMs: number;
  result: null | { correct: boolean; playedLineUci: string[]; solveMs: number; message?: string };
  lastMove: { from: Square; to: Square } | null;

  // coach
  analysis: CoachAnalysis | null;
  grade: CoachMoveGrade | null;
  hintLevel: 0 | ProgressiveHintLevel;
  hint: CoachHint | null;
  coachBusy: boolean;

  // internal pending flags (still pure state)
  pendingAnalysis: boolean;
  pendingGrade: boolean;
};

export type TacticsAttemptAction =
  | { type: 'START'; ref: TacticRef; nowMs: number; attemptToken: string }
  | { type: 'CLEAR_SESSION' }
  | { type: 'RETRY'; nowMs: number; attemptToken: string }
  | { type: 'USER_MOVE'; move: Move; nowMs: number }
  | { type: 'REQUEST_HINT'; level: ProgressiveHintLevel }
  | { type: 'CLEAR_HINT' }
  | { type: 'ANALYSIS_RESOLVED'; attemptToken: string; analysis: CoachAnalysis }
  | { type: 'ANALYSIS_FAILED'; attemptToken: string }
  | { type: 'GRADE_RESOLVED'; attemptToken: string; grade: CoachMoveGrade }
  | { type: 'GRADE_FAILED'; attemptToken: string }
  | { type: 'GIVE_UP'; nowMs: number; displayedLine: string[] };

export type TacticsAttemptEffect =
  | { kind: 'ANALYZE'; attemptToken: string; state: ReturnType<typeof fromFEN>; sideToMove: Color }
  | { kind: 'GRADE_MOVE'; attemptToken: string; beforeState: ReturnType<typeof fromFEN>; move: Move }
  | { kind: 'RECORD_ATTEMPT'; packId: string; itemId: string; success: boolean; solveMs: number };
