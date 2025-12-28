import type { Color, GameState, GameStatus, Move } from '../chessTypes';
import { getGameStatus } from '../gameStatus';

export type EndgameGoalKind = 'mate' | 'draw' | 'promote' | 'win';

export type EndgameGoal = {
  kind: EndgameGoalKind;
  /** Original goal text (if provided). */
  text?: string;
};

/**
 * Parse a free-form goal string into a coarse goal kind.
 * This is intentionally forgiving for v1 packs.
 */
export function parseEndgameGoal(goalText?: string | null): EndgameGoal {
  const raw = (goalText ?? '').trim();
  const t = raw.toLowerCase();

  if (t.includes('promot')) return { kind: 'promote', text: raw };
  if (t.includes('draw') || t.includes('hold') || t.includes('stalemat')) return { kind: 'draw', text: raw };
  if (t.includes('mate')) return { kind: 'mate', text: raw };
  if (t.includes('win')) return { kind: 'win', text: raw };

  // Default: if no goal is provided, treat as "win" (i.e. checkmate eventually).
  return { kind: 'win', text: raw || undefined };
}

export type EndgameGoalCheck = {
  done: boolean;
  success: boolean;
  message: string;
  status: GameStatus;
};

/**
 * Determine whether the goal is complete in the given position.
 *
 * `playerColor` is the side the user is training (usually the side-to-move at the start).
 * `lastMove` and `lastMoveColor` are used for "promote" goals.
 */
export function checkEndgameGoal(
  state: GameState,
  playerColor: Color,
  goal: EndgameGoal,
  lastMove?: Move | null,
  lastMoveColor?: Color | null
): EndgameGoalCheck {
  const status = getGameStatus(state);

  // Promote goals are special: we can succeed even if the game is still in progress.
  if (goal.kind === 'promote') {
    const promoted = !!(lastMove && lastMove.promotion && lastMoveColor === playerColor);
    if (promoted) {
      return { done: true, success: true, message: 'Goal achieved: pawn promoted.', status };
    }
    // If the game ended before promotion, consider it a failure.
    if (status.kind !== 'inProgress') {
      return { done: true, success: false, message: `Game ended (${status.kind}) before promotion.`, status };
    }
    return { done: false, success: false, message: 'Goal: promote a pawn.', status };
  }

  if (status.kind === 'inProgress') {
    const msg =
      goal.kind === 'draw'
        ? 'Goal: draw the position.'
        : goal.kind === 'mate'
          ? 'Goal: checkmate the opponent.'
          : 'Goal: win the position.';
    return { done: false, success: false, message: msg, status };
  }

  // Terminal positions: decide success per goal kind.
  if (goal.kind === 'draw') {
    const isDraw = status.kind === 'stalemate' || status.kind.startsWith('draw');
    return { done: true, success: isDraw, message: isDraw ? 'Goal achieved: draw.' : `Goal failed: ${status.kind}.`, status };
  }

  // "mate" and "win" map to player delivering checkmate in v1.
  if (status.kind === 'checkmate') {
    const ok = status.winner === playerColor;
    return { done: true, success: ok, message: ok ? 'Goal achieved: checkmate.' : 'Goal failed: you were checkmated.', status };
  }

  // Any other terminal status is a failure for win/mate goals.
  return { done: true, success: false, message: `Goal failed: ${status.kind}.`, status };
}
