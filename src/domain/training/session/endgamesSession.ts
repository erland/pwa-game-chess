import type { Color, GameState, Move } from '../../chessTypes';
import { applyMove } from '../../applyMove';
import { cloneGameState } from '../../cloneGameState';
import { generateLegalMoves } from '../../legalMoves';
import { getGameStatus } from '../../gameStatus';
import { moveToUci } from '../../notation/uci';

import { getProgressiveHint } from '../../coach/hints';

import { checkEndgameGoal, parseEndgameGoal } from '../endgameGoals';
import { computeEndgameMoveFeedback, suggestAutoCheckpoint } from '../endgameDrift';

import type { CoachMoveGrade } from '../../coach/types';
import type {
  EndgameRef,
  EndgamesSessionAction,
  EndgamesSessionEffect,
  EndgamesSessionState
} from './endgamesSession.types';

function defaultState(): EndgamesSessionState {
  return {
    ref: null,
    goal: null,

    baseState: null,
    state: null,
    playerColor: 'w',
    startedAtMs: 0,
    playedLineUci: [],
    lastMove: null,
    lastMoveColor: null,

    analysis: null,
    hint: null,
    hintRequestId: 0,
    pendingHintLevel: null,

    lastGrade: null,
    feedback: null,
    totalCpLoss: 0,
    gradedMoves: 0,
    gradeCounts: {},
    gradeRequestId: 0,

    opponentRequestId: 0,

    checkpoint: null,

    result: null
  };
}

export function createEndgamesSessionState(init?: Partial<EndgamesSessionState>): EndgamesSessionState {
  return { ...defaultState(), ...init };
}

function solveMs(startedAtMs: number, nowMs: number): number {
  if (!startedAtMs) return 0;
  return Math.max(0, Math.round(nowMs - startedAtMs));
}

function incGradeCounts(prev: Record<string, number>, label: string): Record<string, number> {
  const out = { ...prev };
  out[label] = (out[label] ?? 0) + 1;
  return out;
}

function finish(
  s: EndgamesSessionState,
  ref: EndgameRef,
  nowMs: number,
  success: boolean,
  message: string,
  statusKind: string
): { state: EndgamesSessionState; effects: EndgamesSessionEffect[] } {
  const effects: EndgamesSessionEffect[] = [];
  const sm = solveMs(s.startedAtMs, nowMs);
  const next: EndgamesSessionState = {
    ...s,
    result: {
      success,
      message,
      statusKind,
      finishedAtMs: nowMs,
      solveMs: sm,
      sessionId: s.result?.sessionId
    }
  };

  effects.push({
    kind: 'PERSIST_FINISH',
    packId: ref.packId,
    itemId: ref.itemId,
    key: ref.key,
    fen: ref.fen,
    success,
    message,
    statusKind,
    startedAtMs: s.startedAtMs,
    endedAtMs: nowMs,
    solveMs: sm,
    playedLineUci: s.playedLineUci,
    totalCpLoss: s.totalCpLoss,
    gradedMoves: s.gradedMoves,
    gradeCounts: s.gradeCounts
  });

  return { state: next, effects };
}

function maybeAutoCheckpoint(s: EndgamesSessionState, grade: CoachMoveGrade | null, nowMs: number): EndgamesSessionState {
  if (!grade) return s;
  if (!s.state || !s.goal) return s;
  if (getGameStatus(s.state).kind !== 'inProgress') return s;
  if (s.state.sideToMove !== s.playerColor) return s;

  const prevAutoScore = s.checkpoint && s.checkpoint.label.startsWith('Key position') ? s.checkpoint.scoreCp : undefined;
  const suggestion = suggestAutoCheckpoint(s.goal, grade.playedScoreCp, grade.label, prevAutoScore);
  const canAutoUpdate = !s.checkpoint || s.checkpoint.label.startsWith('Key position');
  if (!suggestion || !canAutoUpdate) return s;

  return {
    ...s,
    checkpoint: {
      label: suggestion.label,
      state: cloneGameState(s.state),
      ply: s.playedLineUci.length,
      setAtMs: nowMs,
      scoreCp: suggestion.scoreCp
    }
  };
}

export function reduceEndgamesSession(
  prev: EndgamesSessionState,
  action: EndgamesSessionAction
): { state: EndgamesSessionState; effects: EndgamesSessionEffect[] } {
  const effects: EndgamesSessionEffect[] = [];

  switch (action.type) {
    case 'BACK_TO_LIST': {
      return { state: createEndgamesSessionState({ playerColor: prev.playerColor }), effects };
    }

    case 'START': {
      const ref = action.ref;
      const base = cloneGameState(action.baseState);
      const playerColor: Color = base.sideToMove;
      const goal = parseEndgameGoal(ref.goalText);
      let next: EndgamesSessionState = {
        ...defaultState(),
        ref,
        goal,
        baseState: cloneGameState(base),
        state: cloneGameState(base),
        playerColor,
        startedAtMs: action.nowMs
      };

      // Terminal at start.
      const check0 = checkEndgameGoal(next.state!, playerColor, goal, null, null);
      if (check0.done) {
        return finish(next, ref, action.nowMs, check0.success, check0.message, check0.status.kind);
      }

      return { state: next, effects };
    }

    case 'CLEAR_COACHING': {
      return { state: { ...prev, analysis: null, hint: null, pendingHintLevel: null }, effects };
    }

    case 'DISMISS_FEEDBACK': {
      return { state: { ...prev, feedback: null }, effects };
    }

    case 'SET_CHECKPOINT_NOW': {
      if (!prev.state || prev.result) return { state: prev, effects };
      const cp = {
        label: action.label ?? 'Checkpoint',
        state: cloneGameState(prev.state),
        ply: prev.playedLineUci.length,
        setAtMs: action.nowMs,
        scoreCp: prev.lastGrade?.playedScoreCp
      };
      return { state: { ...prev, checkpoint: cp }, effects };
    }

    case 'RETRY_FROM_CHECKPOINT': {
      const cp = prev.checkpoint;
      if (!cp || !prev.state || !prev.ref || !prev.goal) return { state: prev, effects };

      return {
        state: {
          ...prev,
          state: cloneGameState(cp.state),
          startedAtMs: action.nowMs,
          playedLineUci: prev.playedLineUci.slice(0, Math.min(prev.playedLineUci.length, cp.ply)),
          lastMove: null,
          lastMoveColor: null,
          analysis: null,
          hint: null,
          pendingHintLevel: null,
          lastGrade: null,
          feedback: null,
          totalCpLoss: 0,
          gradedMoves: 0,
          gradeCounts: {},
          result: null
        },
        effects
      };
    }

    case 'REQUEST_HINT': {
      if (!prev.state || !prev.ref || prev.result) return { state: prev, effects };
      const requestId = prev.hintRequestId + 1;
      effects.push({ kind: 'ANALYZE_HINT', requestId, state: prev.state, playerColor: prev.playerColor, level: action.level });
      return {
        state: { ...prev, hintRequestId: requestId, pendingHintLevel: action.level },
        effects
      };
    }

    case 'HINT_ANALYSIS_RESOLVED': {
      if (action.requestId !== prev.hintRequestId) return { state: prev, effects };
      if (!prev.pendingHintLevel) return { state: { ...prev, analysis: action.analysis, hint: null }, effects };
      const hint = action.analysis ? getProgressiveHint(action.analysis, prev.pendingHintLevel) : null;
      return {
        state: { ...prev, analysis: action.analysis, hint, pendingHintLevel: null },
        effects
      };
    }

    case 'USER_MOVE': {
      if (!prev.state || !prev.ref || !prev.goal) return { state: prev, effects };
      if (prev.result) return { state: prev, effects };

      const mover: Color = prev.state.sideToMove;
      const before = prev.state;
      const nextState = applyMove(prev.state, action.move);
      const played = prev.playedLineUci.concat([moveToUci(action.move)]);

      let next: EndgamesSessionState = {
        ...prev,
        state: nextState,
        playedLineUci: played,
        lastMove: action.move,
        lastMoveColor: mover,
        analysis: null,
        hint: null,
        pendingHintLevel: null,
        // feedback persists until dismissed
      };

      // If player's move, request grading.
      if (mover === prev.playerColor) {
        const requestId = prev.gradeRequestId + 1;
        effects.push({ kind: 'GRADE_MOVE', requestId, beforeState: before, move: action.move });
        next = { ...next, gradeRequestId: requestId };
      }

      // Goal check after this move.
      const check = checkEndgameGoal(nextState, prev.playerColor, prev.goal, action.move, mover);
      if (check.done) {
        return finish(next, prev.ref, action.nowMs, check.success, check.message, check.status.kind);
      }

      // If opponent to move, request a best move.
      if (getGameStatus(nextState).kind === 'inProgress' && nextState.sideToMove !== prev.playerColor) {
        const reqId = prev.opponentRequestId + 1;
        effects.push({ kind: 'ANALYZE_OPPONENT', requestId: reqId, state: nextState, sideToMove: nextState.sideToMove });
        next = { ...next, opponentRequestId: reqId };
      }

      return { state: next, effects };
    }

    case 'OPPONENT_MOVE_RESOLVED': {
      if (!prev.state || !prev.ref || !prev.goal) return { state: prev, effects };
      if (prev.result) return { state: prev, effects };
      if (action.requestId !== prev.opponentRequestId) return { state: prev, effects };
      if (!action.bestMoveUci) return { state: prev, effects };

      const legal = generateLegalMoves(prev.state);
      const cand = legal.find((m) => moveToUci(m) === action.bestMoveUci);
      if (!cand) return { state: prev, effects };

      const mover: Color = prev.state.sideToMove;
      const nextState = applyMove(prev.state, cand);
      const played = prev.playedLineUci.concat([action.bestMoveUci]);

      let next: EndgamesSessionState = {
        ...prev,
        state: nextState,
        playedLineUci: played,
        lastMove: cand,
        lastMoveColor: mover
      };

      const check = checkEndgameGoal(nextState, prev.playerColor, prev.goal, cand, mover);
      if (check.done) {
        return finish(next, prev.ref, action.nowMs, check.success, check.message, check.status.kind);
      }

      // If still opponent to move (shouldn't happen), request again.
      if (getGameStatus(nextState).kind === 'inProgress' && nextState.sideToMove !== prev.playerColor) {
        const reqId = prev.opponentRequestId + 1;
        effects.push({ kind: 'ANALYZE_OPPONENT', requestId: reqId, state: nextState, sideToMove: nextState.sideToMove });
        next = { ...next, opponentRequestId: reqId };
      }

      return { state: next, effects };
    }

    case 'GRADE_RESOLVED': {
      if (!prev.goal) return { state: prev, effects };
      if (action.requestId !== prev.gradeRequestId) return { state: prev, effects };

      const grade = action.grade;
      let next: EndgamesSessionState = {
        ...prev,
        lastGrade: grade,
        feedback: grade ? computeEndgameMoveFeedback(prev.goal, grade) : null
      };

      if (grade) {
        const cpLoss = Math.max(0, Math.round(grade.cpLoss ?? 0));
        next = {
          ...next,
          totalCpLoss: prev.totalCpLoss + cpLoss,
          gradedMoves: prev.gradedMoves + 1,
          gradeCounts: incGradeCounts(prev.gradeCounts, grade.label)
        };
      }

      next = maybeAutoCheckpoint(next, grade, action.nowMs);
      return { state: next, effects };
    }

    case 'GIVE_UP': {
      if (!prev.state || !prev.ref) return { state: prev, effects };
      if (prev.result) return { state: prev, effects };
      return finish(prev, prev.ref, action.nowMs, false, 'Gave up.', getGameStatus(prev.state).kind);
    }

    case 'SET_SESSION_ID': {
      if (!prev.result) return { state: prev, effects };
      return { state: { ...prev, result: { ...prev.result, sessionId: action.sessionId } }, effects };
    }
  }
}
