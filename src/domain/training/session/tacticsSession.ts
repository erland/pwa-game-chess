import { fromFEN } from '../../notation/fen';
import type { CoachAnalysis, CoachMoveGrade } from '../../coach/types';
import { getProgressiveHint } from '../../coach/hints';

import { getSolutionLines, normalizeUci, progressTacticLine } from '../tactics';

import type {
  TacticsAttemptAction,
  TacticsAttemptEffect,
  TacticsAttemptState,
  TacticRef
} from './tacticsSession.types';

function computeCoachBusy(s: Pick<TacticsAttemptState, 'pendingAnalysis' | 'pendingGrade'>): boolean {
  return Boolean(s.pendingAnalysis || s.pendingGrade);
}

export function createTacticsAttempt(ref: TacticRef, nowMs: number, attemptToken: string): TacticsAttemptState {
  const baseState = fromFEN(ref.item.position.fen);
  const solutionLines = getSolutionLines(ref.item);

  return {
    ref,
    attemptToken,
    baseState,
    state: baseState,
    userColor: baseState.sideToMove,
    solutionLines,
    activeLine: null,
    ply: 0,
    playedLineUci: [],
    userMoveGrades: [],
    startedAtMs: nowMs,
    result: null,
    lastMove: null,

    analysis: null,
    grade: null,
    hintLevel: 0,
    hint: null,
    coachBusy: false,

    pendingAnalysis: false,
    pendingGrade: false
  };
}

function headlineGrade(grades: CoachMoveGrade[]): CoachMoveGrade | null {
  if (grades.length === 0) return null;
  // Keep the worst cpLoss as headline (highest cpLoss), if cpLoss is present.
  const sortable = grades.filter((g) => Number.isFinite(g.cpLoss));
  if (sortable.length === 0) return grades[grades.length - 1] ?? null;
  sortable.sort((a, b) => (b.cpLoss ?? 0) - (a.cpLoss ?? 0));
  return sortable[0] ?? grades[grades.length - 1] ?? null;
}

export function reduceTacticsAttempt(
  prev: TacticsAttemptState | null,
  action: TacticsAttemptAction
): { state: TacticsAttemptState | null; effects: TacticsAttemptEffect[] } {
  // Start is allowed from null.
  if (!prev) {
    if (action.type === 'START') {
      return { state: createTacticsAttempt(action.ref, action.nowMs, action.attemptToken), effects: [] };
    }
    return { state: prev, effects: [] };
  }

  switch (action.type) {
    case 'START': {
      return { state: createTacticsAttempt(action.ref, action.nowMs, action.attemptToken), effects: [] };
    }

    case 'CLEAR_SESSION': {
      return { state: null, effects: [] };
    }

    case 'RETRY': {
      const next: TacticsAttemptState = {
        ...prev,
        attemptToken: action.attemptToken,
        state: prev.baseState,
        activeLine: null,
        ply: 0,
        playedLineUci: [],
        userMoveGrades: [],
        startedAtMs: action.nowMs,
        result: null,
        lastMove: null,

        analysis: null,
        grade: null,
        hintLevel: 0,
        hint: null,

        pendingAnalysis: false,
        pendingGrade: false,
        coachBusy: false
      };
      return { state: next, effects: [] };
    }

    case 'USER_MOVE': {
      if (prev.result) return { state: prev, effects: [] };
      if (prev.state.sideToMove !== prev.userColor) return { state: prev, effects: [] };

      const beforeState = prev.state;
      const solveMs = Math.max(0, Math.round(action.nowMs - prev.startedAtMs));

      const prog = progressTacticLine(beforeState, action.move, prev.ref.item, {
        userColor: prev.userColor,
        activeLine: prev.activeLine,
        playedLineUci: prev.playedLineUci
      });

      const effects: TacticsAttemptEffect[] = [];
      // Always grade the move (best-effort).
      effects.push({ kind: 'GRADE_MOVE', attemptToken: prev.attemptToken, beforeState, move: action.move });

      let next: TacticsAttemptState;

      if (prog.kind === 'wrong' || prog.kind === 'packIllegal') {
        effects.push({
          kind: 'RECORD_ATTEMPT',
          packId: prev.ref.pack.id,
          itemId: prev.ref.item.itemId,
          success: false,
          solveMs
        });

        next = {
          ...prev,
          state: prog.state,
          activeLine: prog.kind === 'packIllegal' ? prog.activeLine : prev.activeLine,
          ply: prog.ply,
          playedLineUci: prog.playedLineUci,
          result: {
            correct: false,
            playedLineUci: prog.playedLineUci,
            solveMs,
            message: prog.kind === 'packIllegal' ? prog.message : undefined
          },
          lastMove: prog.lastMove,

          // Clear hint+analysis since the position changed.
          hint: null,
          hintLevel: 0,
          analysis: null,

          // We'll fill grades asynchronously.
          pendingGrade: true,
          pendingAnalysis: false,
          coachBusy: true
        };

        return { state: next, effects };
      }

      const complete = prog.kind === 'complete';
      if (complete) {
        effects.push({
          kind: 'RECORD_ATTEMPT',
          packId: prev.ref.pack.id,
          itemId: prev.ref.item.itemId,
          success: true,
          solveMs
        });
      }

      next = {
        ...prev,
        state: prog.state,
        activeLine: prog.activeLine,
        ply: prog.ply,
        playedLineUci: prog.playedLineUci,
        result: complete ? { correct: true, playedLineUci: prog.playedLineUci, solveMs } : null,
        lastMove: prog.lastMove,

        hint: null,
        hintLevel: 0,
        analysis: null,

        pendingGrade: true,
        pendingAnalysis: false,
        coachBusy: true
      };

      return { state: next, effects };
    }

    case 'REQUEST_HINT': {
      if (prev.result) return { state: prev, effects: [] };

      // If an analysis is already in flight, just update the requested level.
      if (prev.pendingAnalysis) {
        return { state: { ...prev, hintLevel: action.level }, effects: [] };
      }

      // If we already have analysis for the *current* position, we can compute immediately.
      if (prev.analysis) {
        const hint = getProgressiveHint(prev.analysis, action.level);
        const next: TacticsAttemptState = {
          ...prev,
          hintLevel: action.level,
          hint
        };
        return { state: next, effects: [] };
      }

      const next: TacticsAttemptState = {
        ...prev,
        hintLevel: action.level,
        hint: null,
        pendingAnalysis: true
      };
      next.coachBusy = computeCoachBusy(next);

      const eff: TacticsAttemptEffect = {
        kind: 'ANALYZE',
        attemptToken: prev.attemptToken,
        state: prev.state,
        sideToMove: prev.state.sideToMove
      };
      return { state: next, effects: [eff] };
    }

    case 'CLEAR_HINT': {
      const next: TacticsAttemptState = {
        ...prev,
        hintLevel: 0,
        hint: null
      };
      return { state: next, effects: [] };
    }

    case 'ANALYSIS_RESOLVED': {
      if (action.attemptToken !== prev.attemptToken) return { state: prev, effects: [] };
      const analysis: CoachAnalysis = action.analysis;
      const hint = prev.hintLevel ? getProgressiveHint(analysis, prev.hintLevel) : null;
      const next: TacticsAttemptState = {
        ...prev,
        analysis,
        hint,
        pendingAnalysis: false
      };
      next.coachBusy = computeCoachBusy(next);
      return { state: next, effects: [] };
    }

    case 'ANALYSIS_FAILED': {
      if (action.attemptToken !== prev.attemptToken) return { state: prev, effects: [] };
      const next: TacticsAttemptState = {
        ...prev,
        pendingAnalysis: false
      };
      next.coachBusy = computeCoachBusy(next);
      return { state: next, effects: [] };
    }

    case 'GRADE_RESOLVED': {
      if (action.attemptToken !== prev.attemptToken) return { state: prev, effects: [] };
      const grades = [...(prev.userMoveGrades ?? []), action.grade];
      const next: TacticsAttemptState = {
        ...prev,
        userMoveGrades: grades,
        grade: headlineGrade(grades),
        pendingGrade: false
      };
      next.coachBusy = computeCoachBusy(next);
      return { state: next, effects: [] };
    }

    case 'GRADE_FAILED': {
      if (action.attemptToken !== prev.attemptToken) return { state: prev, effects: [] };
      const next: TacticsAttemptState = {
        ...prev,
        pendingGrade: false
      };
      next.coachBusy = computeCoachBusy(next);
      return { state: next, effects: [] };
    }

    case 'GIVE_UP': {
      if (prev.result) return { state: prev, effects: [] };
      const solveMs = Math.max(0, Math.round(action.nowMs - prev.startedAtMs));
      const line = action.displayedLine ?? [];
      const msg = line.length > 0 ? `Solution line: ${line.map(normalizeUci).join(' ')}` : 'No solution line available.';

      const next: TacticsAttemptState = {
        ...prev,
        result: {
          correct: false,
          playedLineUci: prev.playedLineUci,
          solveMs,
          message: msg
        }
      };

      const eff: TacticsAttemptEffect = {
        kind: 'RECORD_ATTEMPT',
        packId: prev.ref.pack.id,
        itemId: prev.ref.item.itemId,
        success: false,
        solveMs
      };

      return { state: next, effects: [eff] };
    }

    default:
      return { state: prev, effects: [] };
  }
}
