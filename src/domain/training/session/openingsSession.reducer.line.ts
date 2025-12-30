import type { Color, GameState } from '../../chessTypes';

import { applyMove } from '../../applyMove';
import { tryParseFEN } from '../../notation/fen';
import { moveToUci } from '../../notation/uci';

import { autoPlayOpponentReplies, normalizeUci } from '../openingsDrill';

import type { OpeningsSessionAction, OpeningsSessionEffect, OpeningsSessionState } from './openingsSession.types';

import {
  drillColorForFenSideToMove,
  expectedUci,
  pushLineAttempt,
  solveMsFrom
} from './openingsSession.helpers';

/**
 * Reducer logic specific to line mode.
 * Pure: returns next state + emits persistence effects.
 */
export function reduceOpeningsLineMode(
  prev: OpeningsSessionState,
  action: OpeningsSessionAction,
  effects: OpeningsSessionEffect[]
): OpeningsSessionState {
  switch (action.type) {
    case 'START_LINE': {
      const fen = action.ref.item.position.fen;
      const parsed = tryParseFEN(fen);
      if (!parsed.ok) {
        return {
          ...prev,
          current: action.ref,
          currentNode: null,
          initialFen: fen,
          state: null,
          index: 0,
          running: false,
          resultMsg: `Invalid FEN: ${parsed.error}`,
          showHintFlag: false
        };
      }

      // Default drill color: user drills the side to move from the FEN.
      const effectiveDrillColor: Color = drillColorForFenSideToMove(parsed.value.sideToMove);

      const auto = autoPlayOpponentReplies(parsed.value, action.ref.lineUci, 0, effectiveDrillColor);
      if (auto.error) {
        return {
          ...prev,
          current: action.ref,
          currentNode: null,
          drillColor: effectiveDrillColor,
          orientation: effectiveDrillColor,
          initialFen: fen,
          state: auto.state,
          index: auto.nextIndex,
          running: false,
          resultMsg: auto.error,
          showHintFlag: false
        };
      }

      return {
        ...prev,
        mode: 'line',
        drillColor: effectiveDrillColor,
        orientation: effectiveDrillColor,
        current: action.ref,
        currentNode: null,
        initialFen: fen,
        state: auto.state,
        index: auto.nextIndex,
        running: true,
        resultMsg: null,
        showHintFlag: false,
        startedAtMs: action.nowMs
      };
    }

    case 'RESET_TO_INITIAL': {
      if (!prev.current) return prev;
      const fen = prev.current.item.position.fen;
      const parsed = tryParseFEN(fen);
      if (!parsed.ok) {
        return {
          ...prev,
          initialFen: fen,
          state: null,
          index: 0,
          running: false,
          resultMsg: `Invalid FEN: ${parsed.error}`,
          showHintFlag: false
        };
      }

      const auto = autoPlayOpponentReplies(parsed.value, prev.current.lineUci, 0, prev.drillColor);
      if (auto.error) {
        return {
          ...prev,
          initialFen: fen,
          state: auto.state,
          index: auto.nextIndex,
          running: false,
          resultMsg: auto.error,
          showHintFlag: false
        };
      }

      return {
        ...prev,
        initialFen: fen,
        state: auto.state,
        index: auto.nextIndex,
        running: true,
        resultMsg: null,
        showHintFlag: false,
        startedAtMs: action.nowMs
      };
    }

    case 'APPLY_MOVE': {
      if (!prev.running || !prev.state) return prev;
      if (prev.state.sideToMove !== prev.drillColor) return prev;
      const ref = prev.current;
      if (!ref) return prev;

      const exp = expectedUci('line', ref, null, prev.index);
      const moveUci = normalizeUci(moveToUci(action.move));

      // Defensive: if no expected move, treat as done.
      if (!exp) {
        const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);
        pushLineAttempt(effects, ref, true, solveMs);
        return { ...prev, running: false, showHintFlag: false, resultMsg: 'Line complete.' };
      }

      const expectedNorm = normalizeUci(exp);
      if (moveUci !== expectedNorm) {
        const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);
        pushLineAttempt(effects, ref, false, solveMs);
        return {
          ...prev,
          running: false,
          showHintFlag: false,
          resultMsg: `Incorrect. Expected ${exp}. You played ${moveUci}.`
        };
      }

      // Correct move.
      let nextState: GameState = applyMove(prev.state, action.move);
      const nextIndex0 = prev.index + 1;

      const auto = autoPlayOpponentReplies(nextState, ref.lineUci, nextIndex0, prev.drillColor);
      if (auto.error) {
        const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);
        pushLineAttempt(effects, ref, false, solveMs);
        return {
          ...prev,
          state: auto.state,
          index: auto.nextIndex,
          running: false,
          showHintFlag: false,
          resultMsg: auto.error
        };
      }

      nextState = auto.state;
      const nextIndex = auto.nextIndex;

      if (nextIndex >= ref.lineUci.length) {
        const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);
        pushLineAttempt(effects, ref, true, solveMs);
        return {
          ...prev,
          state: nextState,
          index: nextIndex,
          running: false,
          showHintFlag: false,
          resultMsg: 'Nice! Line completed.'
        };
      }

      return {
        ...prev,
        state: nextState,
        index: nextIndex,
        showHintFlag: false
      };
    }
  }

  return prev;
}
