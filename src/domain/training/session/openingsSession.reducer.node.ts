import type { GameState } from '../../chessTypes';
import type { Move } from '../../chessTypes';

import { applyMove } from '../../applyMove';
import { tryParseFEN } from '../../notation/fen';
import { moveToUci } from '../../notation/uci';

import { autoPlayOpponentReplies, normalizeUci } from '../openingsDrill';

import type { OpeningsSessionAction, OpeningsSessionEffect, OpeningsSessionState } from './openingsSession.types';

import { expectedUci, pushNodeAttempt, solveMsFrom } from './openingsSession.helpers';

/**
 * Reducer logic specific to node mode.
 * Pure: returns next state + emits persistence effects.
 */
export function reduceOpeningsNodesMode(
  prev: OpeningsSessionState,
  action: OpeningsSessionAction,
  effects: OpeningsSessionEffect[]
): OpeningsSessionState {
  switch (action.type) {
    case 'START_NODE': {
      const parsed = tryParseFEN(action.node.fen);
      if (!parsed.ok) {
        return {
          ...prev,
          currentNode: action.node,
          current: null,
          initialFen: action.node.fen,
          state: null,
          index: action.node.plyIndex,
          running: false,
          resultMsg: `Invalid FEN: ${parsed.error}`,
          showHintFlag: false
        };
      }

      return {
        ...prev,
        currentNode: action.node,
        current: null,
        initialFen: action.node.fen,
        state: parsed.value,
        index: action.node.plyIndex,
        running: true,
        resultMsg: null,
        showHintFlag: false,
        startedAtMs: action.nowMs,
        orientation: prev.drillColor
      };
    }

    case 'RESET_TO_INITIAL': {
      if (!prev.currentNode) return prev;
      const fen = prev.currentNode.fen;
      const parsed = tryParseFEN(fen);
      if (!parsed.ok) {
        return {
          ...prev,
          initialFen: fen,
          state: null,
          index: prev.currentNode.plyIndex,
          running: false,
          resultMsg: `Invalid FEN: ${parsed.error}`,
          showHintFlag: false
        };
      }
      return {
        ...prev,
        initialFen: fen,
        state: parsed.value,
        index: prev.currentNode.plyIndex,
        running: true,
        resultMsg: null,
        showHintFlag: false,
        startedAtMs: action.nowMs
      };
    }

    case 'APPLY_MOVE': {
      if (!prev.running || !prev.state) return prev;
      if (prev.state.sideToMove !== prev.drillColor) return prev;
      const node = prev.currentNode;
      if (!node) return prev;

      const exp = expectedUci('nodes', null, node, prev.index);
      const moveUci = normalizeUci(moveToUci(action.move));

      // Defensive: if no expected move, treat as done.
      if (!exp) {
        const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);
        pushNodeAttempt(effects, node, true, solveMs);
        return { ...prev, running: false, showHintFlag: false, resultMsg: 'Done.' };
      }

      const expectedNorm = normalizeUci(exp);
      if (moveUci !== expectedNorm) {
        const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);
        pushNodeAttempt(effects, node, false, solveMs);
        return {
          ...prev,
          running: false,
          showHintFlag: false,
          resultMsg: `Incorrect. Expected ${expectedNorm}. You played ${moveUci}.`
        };
      }

      // Correct move.
      let nextState: GameState = applyMove(prev.state, action.move);
      const nextIndex = node.plyIndex + 1;
      const auto = autoPlayOpponentReplies(nextState, node.lineUci, nextIndex, prev.drillColor);
      if (auto.error) {
        const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);
        pushNodeAttempt(effects, node, false, solveMs);
        return {
          ...prev,
          state: auto.state,
          index: nextIndex,
          running: false,
          showHintFlag: false,
          resultMsg: auto.error
        };
      }

      const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);
      pushNodeAttempt(effects, node, true, solveMs);
      return {
        ...prev,
        state: auto.state,
        index: nextIndex,
        running: false,
        showHintFlag: false,
        resultMsg: 'Correct!'
      };
    }
  }

  return prev;
}
