import type { GameState } from '../chessTypes';
import type { CoachGradeLabel, CoachMoveGrade } from '../coach/types';
import type { EndgameGoal } from './endgameGoals';

export type EndgameDriftSeverity = 'inaccuracy' | 'mistake' | 'blunder';

export type EndgameMoveFeedback = {
  severity: EndgameDriftSeverity;
  label: CoachGradeLabel;
  cpLoss: number;
  bestMoveUci?: string;
  bestScoreCp: number;
  playedScoreCp: number;
  message: string;
};

export type EndgameCheckpoint = {
  label: string;
  /** A position where it is the player's turn to move (recommended). */
  state: GameState;
  /** How many UCI moves were played when this checkpoint was captured. */
  ply: number;
  setAtMs: number;
  scoreCp?: number;
};

const WINNING_THRESHOLD_CP = 200;
const CLEAR_WIN_THRESHOLD_CP = 300;

const DRAWISH_ABS_CP = 80;
const DRAW_SLIP_LOSS_CP = 200;

function clampScoreCp(v: number | undefined | null): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
}

function severityFromLabel(label: CoachGradeLabel): EndgameDriftSeverity | null {
  if (label === 'inaccuracy') return 'inaccuracy';
  if (label === 'mistake') return 'mistake';
  if (label === 'blunder') return 'blunder';
  return null;
}

/**
 * Decide whether to surface "eval drift" feedback for an endgame move.
 *
 * Per the training plan, we primarily flag drift when the user is/was clearly
 * winning (or holding a draw) and the evaluation worsens significantly.
 */
export function computeEndgameMoveFeedback(goal: EndgameGoal, grade: CoachMoveGrade): EndgameMoveFeedback | null {
  const sev = severityFromLabel(grade.label);
  if (!sev) return null;

  const bestScoreCp = clampScoreCp(grade.bestScoreCp);
  const playedScoreCp = clampScoreCp(grade.playedScoreCp);
  const cpLoss = Math.max(0, Math.round(grade.cpLoss ?? 0));

  // For win/mate/promote goals, only flag if we're winning and we gave up a chunk of eval.
  if (goal.kind !== 'draw') {
    if (bestScoreCp < WINNING_THRESHOLD_CP) return null;
    if (cpLoss < 80 && grade.label === 'inaccuracy') return null;

    const msg =
      grade.label === 'inaccuracy'
        ? `Inaccuracy: advantage slipped (−${cpLoss} cp).`
        : grade.label === 'mistake'
          ? `Mistake: advantage dropped (−${cpLoss} cp).`
          : `Blunder: winning position thrown away (−${cpLoss} cp).`;

    return {
      severity: sev,
      label: grade.label,
      cpLoss,
      bestMoveUci: grade.bestMoveUci,
      bestScoreCp,
      playedScoreCp,
      message: msg
    };
  }

  // Draw goal: we flag drift if the position was holdable and we fell into a losing eval.
  const wasHoldable = Math.abs(bestScoreCp) <= DRAWISH_ABS_CP || bestScoreCp >= -DRAWISH_ABS_CP;
  const nowClearlyLosing = playedScoreCp <= -DRAW_SLIP_LOSS_CP;
  const droppedSharply = playedScoreCp <= bestScoreCp - 150;

  if (!wasHoldable) return null;
  if (!nowClearlyLosing && !droppedSharply) return null;

  const msg =
    grade.label === 'inaccuracy'
      ? `Inaccuracy: draw chances reduced (−${cpLoss} cp).`
      : grade.label === 'mistake'
        ? `Mistake: draw is slipping (−${cpLoss} cp).`
        : `Blunder: draw thrown away (−${cpLoss} cp).`;

  return {
    severity: sev,
    label: grade.label,
    cpLoss,
    bestMoveUci: grade.bestMoveUci,
    bestScoreCp,
    playedScoreCp,
    message: msg
  };
}

export type AutoCheckpointSuggestion = {
  label: string;
  scoreCp: number;
};

/**
 * Suggest an automatic checkpoint when the user reaches a "key" position.
 *
 * This is intentionally conservative: we only checkpoint after good moves.
 */
export function suggestAutoCheckpoint(goal: EndgameGoal, scoreCp: number | undefined, label: CoachGradeLabel, prevScoreCp?: number): AutoCheckpointSuggestion | null {
  if (label !== 'best' && label !== 'excellent' && label !== 'good') return null;
  const s = clampScoreCp(scoreCp);

  if (goal.kind === 'draw') {
    if (Math.abs(s) > 60) return null;
    if (typeof prevScoreCp === 'number' && Math.abs(s) >= Math.abs(prevScoreCp) - 5) return null;
    return { label: 'Key position (holdable draw)', scoreCp: s };
  }

  if (s < CLEAR_WIN_THRESHOLD_CP) return null;
  if (typeof prevScoreCp === 'number' && s <= prevScoreCp + 25) return null;
  return { label: 'Key position (winning)', scoreCp: s };
}
