import type { Color, GameState, Move } from '../../chessTypes';
import { applyMove } from '../../applyMove';
import { tryParseFEN } from '../../notation/fen';
import { moveToUci } from '../../notation/uci';

import { autoPlayOpponentReplies, normalizeUci } from '../openingsDrill';

import type {
  DrillMode,
  OpeningRef,
  OpeningsSessionAction,
  OpeningsSessionEffect,
  OpeningsSessionState
} from './openingsSession.types';

import type { OpeningNodeRef } from '../openingNodes';

function defaultSessionState(): OpeningsSessionState {
  return {
    mode: 'nodes',
    drillColor: 'w',
    orientation: 'w',

    current: null,
    currentNode: null,

    initialFen: null,
    state: null,
    index: 0,

    running: false,
    resultMsg: null,
    showHintFlag: false,
    startedAtMs: 0
  };
}

export function createOpeningsSessionState(init?: Partial<OpeningsSessionState>): OpeningsSessionState {
  return { ...defaultSessionState(), ...init };
}

function solveMsFrom(startedAtMs: number, nowMs: number): number {
  if (!startedAtMs) return 0;
  return Math.max(0, Math.round(nowMs - startedAtMs));
}

function expectedUci(mode: DrillMode, current: OpeningRef | null, currentNode: OpeningNodeRef | null, index: number): string | null {
  if (mode === 'nodes') return currentNode?.expectedUci ?? null;
  if (!current) return null;
  return current.lineUci[index] ?? null;
}

export function reduceOpeningsSession(
  prev: OpeningsSessionState,
  action: OpeningsSessionAction
): { state: OpeningsSessionState; effects: OpeningsSessionEffect[] } {
  const effects: OpeningsSessionEffect[] = [];

  switch (action.type) {
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

    case 'START_NODE': {
      const parsed = tryParseFEN(action.node.fen);
      if (!parsed.ok) {
        return {
          state: {
            ...prev,
            currentNode: action.node,
            current: null,
            initialFen: action.node.fen,
            state: null,
            index: action.node.plyIndex,
            running: false,
            resultMsg: `Invalid FEN: ${parsed.error}`,
            showHintFlag: false
          },
          effects
        };
      }

      return {
        state: {
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
        },
        effects
      };
    }

    case 'START_LINE': {
      const fen = action.ref.item.position.fen;
      const parsed = tryParseFEN(fen);
      if (!parsed.ok) {
        return {
          state: {
            ...prev,
            current: action.ref,
            currentNode: null,
            initialFen: fen,
            state: null,
            index: 0,
            running: false,
            resultMsg: `Invalid FEN: ${parsed.error}`,
            showHintFlag: false
          },
          effects
        };
      }

      // Default drill color: user drills the side to move from the FEN.
      const effectiveDrillColor: Color = parsed.value.sideToMove;
      let s = parsed.value;
      const auto = autoPlayOpponentReplies(s, action.ref.lineUci, 0, effectiveDrillColor);
      if (auto.error) {
        return {
          state: {
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
          },
          effects
        };
      }

      s = auto.state;

      return {
        state: {
          ...prev,
          mode: 'line',
          drillColor: effectiveDrillColor,
          orientation: effectiveDrillColor,
          current: action.ref,
          currentNode: null,
          initialFen: fen,
          state: s,
          index: auto.nextIndex,
          running: true,
          resultMsg: null,
          showHintFlag: false,
          startedAtMs: action.nowMs
        },
        effects
      };
    }

    case 'RESET_TO_INITIAL': {
      if (prev.mode === 'nodes') {
        if (!prev.currentNode) return { state: prev, effects };
        const fen = prev.currentNode.fen;
        const parsed = tryParseFEN(fen);
        if (!parsed.ok) {
          return {
            state: {
              ...prev,
              initialFen: fen,
              state: null,
              index: prev.currentNode.plyIndex,
              running: false,
              resultMsg: `Invalid FEN: ${parsed.error}`,
              showHintFlag: false
            },
            effects
          };
        }
        return {
          state: {
            ...prev,
            initialFen: fen,
            state: parsed.value,
            index: prev.currentNode.plyIndex,
            running: true,
            resultMsg: null,
            showHintFlag: false,
            startedAtMs: action.nowMs
          },
          effects
        };
      }

      // line
      if (!prev.current) return { state: prev, effects };
      const fen = prev.current.item.position.fen;
      const parsed = tryParseFEN(fen);
      if (!parsed.ok) {
        return {
          state: {
            ...prev,
            initialFen: fen,
            state: null,
            index: 0,
            running: false,
            resultMsg: `Invalid FEN: ${parsed.error}`,
            showHintFlag: false
          },
          effects
        };
      }

      const auto = autoPlayOpponentReplies(parsed.value, prev.current.lineUci, 0, prev.drillColor);
      if (auto.error) {
        return {
          state: {
            ...prev,
            initialFen: fen,
            state: auto.state,
            index: auto.nextIndex,
            running: false,
            resultMsg: auto.error,
            showHintFlag: false
          },
          effects
        };
      }

      return {
        state: {
          ...prev,
          initialFen: fen,
          state: auto.state,
          index: auto.nextIndex,
          running: true,
          resultMsg: null,
          showHintFlag: false,
          startedAtMs: action.nowMs
        },
        effects
      };
    }

    case 'APPLY_MOVE': {
      if (!prev.running || !prev.state) return { state: prev, effects };
      if (prev.state.sideToMove !== prev.drillColor) return { state: prev, effects };

      const exp = expectedUci(prev.mode, prev.current, prev.currentNode, prev.index);
      const moveUci = normalizeUci(moveToUci(action.move));

      // Defensive: if no expected move, treat as done.
      if (!exp) {
        const msg = prev.mode === 'nodes' ? 'Done.' : 'Line complete.';
        const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);

        if (prev.mode === 'nodes' && prev.currentNode) {
          effects.push({
            kind: 'RECORD_NODE_ATTEMPT',
            key: prev.currentNode.key,
            packId: prev.currentNode.packId,
            itemId: prev.currentNode.itemId,
            plyIndex: prev.currentNode.plyIndex,
            success: true,
            solveMs
          });
        } else if (prev.mode === 'line' && prev.current) {
          effects.push({
            kind: 'RECORD_LINE_ATTEMPT',
            packId: prev.current.packId,
            itemId: prev.current.item.itemId,
            success: true,
            solveMs
          });
        }

        return {
          state: { ...prev, running: false, showHintFlag: false, resultMsg: msg },
          effects
        };
      }

      const expectedNorm = normalizeUci(exp);
      if (moveUci !== expectedNorm) {
        const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);
        const msg = prev.mode === 'nodes'
          ? `Incorrect. Expected ${expectedNorm}. You played ${moveUci}.`
          : `Incorrect. Expected ${exp}. You played ${moveUci}.`;

        if (prev.mode === 'nodes' && prev.currentNode) {
          effects.push({
            kind: 'RECORD_NODE_ATTEMPT',
            key: prev.currentNode.key,
            packId: prev.currentNode.packId,
            itemId: prev.currentNode.itemId,
            plyIndex: prev.currentNode.plyIndex,
            success: false,
            solveMs
          });
        } else if (prev.mode === 'line' && prev.current) {
          effects.push({ kind: 'RECORD_LINE_ATTEMPT', packId: prev.current.packId, itemId: prev.current.item.itemId, success: false, solveMs });
        }

        return {
          state: { ...prev, running: false, showHintFlag: false, resultMsg: msg },
          effects
        };
      }

      // Correct move.
      let nextState: GameState = applyMove(prev.state, action.move);

      if (prev.mode === 'nodes') {
        const node = prev.currentNode;
        if (!node) return { state: prev, effects };
        const nextIndex = node.plyIndex + 1;
        const auto = autoPlayOpponentReplies(nextState, node.lineUci, nextIndex, prev.drillColor);
        if (auto.error) {
          const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);
          effects.push({
            kind: 'RECORD_NODE_ATTEMPT',
            key: node.key,
            packId: node.packId,
            itemId: node.itemId,
            plyIndex: node.plyIndex,
            success: false,
            solveMs
          });
          return {
            state: {
              ...prev,
              state: auto.state,
              index: nextIndex,
              running: false,
              showHintFlag: false,
              resultMsg: auto.error
            },
            effects
          };
        }

        const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);
        effects.push({
          kind: 'RECORD_NODE_ATTEMPT',
          key: node.key,
          packId: node.packId,
          itemId: node.itemId,
          plyIndex: node.plyIndex,
          success: true,
          solveMs
        });

        return {
          state: {
            ...prev,
            state: auto.state,
            index: nextIndex,
            running: false,
            showHintFlag: false,
            resultMsg: 'Correct!'
          },
          effects
        };
      }

      // line mode
      const ref = prev.current;
      if (!ref) return { state: prev, effects };
      let nextIndex = prev.index + 1;
      const auto = autoPlayOpponentReplies(nextState, ref.lineUci, nextIndex, prev.drillColor);
      if (auto.error) {
        const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);
        effects.push({ kind: 'RECORD_LINE_ATTEMPT', packId: ref.packId, itemId: ref.item.itemId, success: false, solveMs });
        return {
          state: {
            ...prev,
            state: auto.state,
            index: auto.nextIndex,
            running: false,
            showHintFlag: false,
            resultMsg: auto.error
          },
          effects
        };
      }

      nextState = auto.state;
      nextIndex = auto.nextIndex;

      if (nextIndex >= ref.lineUci.length) {
        const solveMs = solveMsFrom(prev.startedAtMs, action.nowMs);
        effects.push({ kind: 'RECORD_LINE_ATTEMPT', packId: ref.packId, itemId: ref.item.itemId, success: true, solveMs });
        return {
          state: {
            ...prev,
            state: nextState,
            index: nextIndex,
            running: false,
            showHintFlag: false,
            resultMsg: 'Nice! Line completed.'
          },
          effects
        };
      }

      return {
        state: {
          ...prev,
          state: nextState,
          index: nextIndex,
          showHintFlag: false
        },
        effects
      };
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
  }
}
