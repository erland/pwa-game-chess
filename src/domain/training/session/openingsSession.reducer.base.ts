import type { OpeningsSessionAction, OpeningsSessionEffect, OpeningsSessionState } from './openingsSession.types';

import { reduceOpeningsLineMode } from './openingsSession.reducer.line';
import { reduceOpeningsNodesMode } from './openingsSession.reducer.node';

/**
 * Base reducer for openings drills.
 *
 * This is intentionally small and delegates mode-specific transitions
 * to `reduceOpeningsLineMode` and `reduceOpeningsNodesMode`.
 */
export function reduceOpeningsSession(
  prev: OpeningsSessionState,
  action: OpeningsSessionAction
): { state: OpeningsSessionState; effects: OpeningsSessionEffect[] } {
  const effects: OpeningsSessionEffect[] = [];

  switch (action.type) {
    // --- shared actions (mode-independent) ---
    case 'SET_RESULT_MSG': {
      return {
        state: {
          ...prev,
          resultMsg: action.message,
          running: false,
          showHintFlag: false
        },
        effects
      };
    }

    case 'SET_MODE': {
      // Switching mode should reset session to avoid mixed state.
      return {
        state: {
          ...prev,
          mode: action.mode,
          current: null,
          currentNode: null,
          initialFen: null,
          state: null,
          index: 0,
          running: false,
          resultMsg: null,
          showHintFlag: false
        },
        effects
      };
    }

    case 'SET_DRILL_COLOR': {
      // Don’t allow changing drillColor mid-run (UI usually prevents it, but keep reducer safe).
      if (prev.running) return { state: prev, effects };
      const c = action.color;
      return { state: { ...prev, drillColor: c, orientation: c }, effects };
    }

    case 'STOP_SESSION': {
      const clearingNodes = prev.mode === 'nodes';
      return {
        state: {
          ...prev,
          running: false,
          showHintFlag: false,
          resultMsg: null,
          currentNode: clearingNodes ? null : prev.currentNode,
          current: clearingNodes ? prev.current : null
        },
        effects
      };
    }

    case 'BACK_TO_LIST': {
      return {
        state: {
          ...prev,
          running: false,
          showHintFlag: false,
          resultMsg: null,
          current: null,
          currentNode: null,
          state: null,
          index: 0,
          initialFen: null
        },
        effects
      };
    }

    case 'TOGGLE_HINT': {
      return { state: { ...prev, showHintFlag: !prev.showHintFlag }, effects };
    }

    case 'SHOW_HINT': {
      return { state: { ...prev, showHintFlag: true }, effects };
    }

    // --- mode-specific actions ---
    case 'START_LINE': {
      const next = reduceOpeningsLineMode(prev, action, effects);
      return { state: next, effects };
    }

    case 'START_NODE': {
      const next = reduceOpeningsNodesMode(prev, action, effects);
      return { state: next, effects };
    }

    case 'RESET_TO_INITIAL': {
      const next = prev.mode === 'line'
        ? reduceOpeningsLineMode(prev, action, effects)
        : reduceOpeningsNodesMode(prev, action, effects);
      return { state: next, effects };
    }

    case 'APPLY_MOVE': {
      const next = prev.mode === 'line'
        ? reduceOpeningsLineMode(prev, action, effects)
        : reduceOpeningsNodesMode(prev, action, effects);
      return { state: next, effects };
    }
  }
}
