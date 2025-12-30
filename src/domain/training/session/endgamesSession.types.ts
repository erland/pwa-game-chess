import type { Color, GameState, Move } from '../../chessTypes';
import type { CoachAnalysis, CoachHint, CoachMoveGrade, ProgressiveHintLevel } from '../../coach/types';

import type { TrainingItemKey } from '../keys';
import type { EndgameGoal } from '../endgameGoals';
import type { EndgameCheckpoint, EndgameMoveFeedback } from '../endgameDrift';

export type EndgameRef = {
  key: TrainingItemKey;
  packId: string;
  itemId: string;
  difficulty: number;
  fen: string;
  goalText?: string;
  themes: string[];
};

export type EndgameResult = {
  success: boolean;
  message: string;
  statusKind: string;
  finishedAtMs: number;
  solveMs: number;
  sessionId?: string;
};

export type EndgamesSessionState = {
  ref: EndgameRef | null;
  goal: EndgameGoal | null;

  baseState: GameState | null;
  state: GameState | null;
  playerColor: Color;
  startedAtMs: number;
  playedLineUci: string[];
  lastMove: Move | null;
  lastMoveColor: Color | null;

  analysis: CoachAnalysis | null;
  hint: CoachHint | null;
  hintRequestId: number;
  pendingHintLevel: ProgressiveHintLevel | null;

  lastGrade: CoachMoveGrade | null;
  feedback: EndgameMoveFeedback | null;
  totalCpLoss: number;
  gradedMoves: number;
  gradeCounts: Record<string, number>;
  gradeRequestId: number;

  opponentRequestId: number;

  checkpoint: EndgameCheckpoint | null;

  result: EndgameResult | null;
};

export type EndgamesSessionAction =
  | { type: 'START'; ref: EndgameRef; baseState: GameState; nowMs: number }
  | { type: 'BACK_TO_LIST' }
  | { type: 'CLEAR_COACHING' }
  | { type: 'DISMISS_FEEDBACK' }
  | { type: 'SET_CHECKPOINT_NOW'; label?: string; nowMs: number }
  | { type: 'RETRY_FROM_CHECKPOINT'; nowMs: number }
  | { type: 'USER_MOVE'; move: Move; nowMs: number }
  | { type: 'OPPONENT_MOVE_RESOLVED'; requestId: number; bestMoveUci: string | null; nowMs: number }
  | { type: 'GRADE_RESOLVED'; requestId: number; grade: CoachMoveGrade | null; nowMs: number }
  | { type: 'REQUEST_HINT'; level: ProgressiveHintLevel; nowMs: number }
  | { type: 'HINT_ANALYSIS_RESOLVED'; requestId: number; analysis: CoachAnalysis | null }
  | { type: 'GIVE_UP'; nowMs: number }
  | { type: 'SET_SESSION_ID'; sessionId: string };

export type EndgamesSessionEffect =
  | {
      kind: 'GRADE_MOVE';
      requestId: number;
      beforeState: GameState;
      move: Move;
    }
  | {
      kind: 'ANALYZE_OPPONENT';
      requestId: number;
      state: GameState;
      sideToMove: Color;
    }
  | {
      kind: 'ANALYZE_HINT';
      requestId: number;
      state: GameState;
      playerColor: Color;
      level: ProgressiveHintLevel;
    }
  | {
      kind: 'PERSIST_FINISH';
      packId: string;
      itemId: string;
      key: TrainingItemKey;
      fen: string;
      success: boolean;
      message: string;
      statusKind: string;
      startedAtMs: number;
      endedAtMs: number;
      solveMs: number;
      playedLineUci: string[];
      totalCpLoss: number;
      gradedMoves: number;
      gradeCounts: Record<string, number>;
    };
