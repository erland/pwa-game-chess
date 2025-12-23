import type { GameState, Move } from './chessTypes';
import { oppositeColor } from './chessTypes';
import { createInitialGameState } from './gameState';
import { applyMove } from './applyMove';

/**
 * Step 6: reducer core
 *
 * Keeping the authoritative transition logic in a single reducer makes it easy to:
 * - replay games (v4)
 * - feed the state to an engine (v2)
 * - sync over the network (v3)
 */

export type GameAction =
  | { type: 'newGame' }
  | { type: 'applyMove'; move: Move }
  | { type: 'resign' }
  | { type: 'agreeDraw' }
  | { type: 'timeout'; loser: GameState['sideToMove'] };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'newGame':
      return createInitialGameState();
    case 'applyMove':
      return applyMove(state, action.move);
    case 'resign': {
      if (state.forcedStatus) return state;
      const loser = state.sideToMove;
      const winner = oppositeColor(loser);
      return { ...state, forcedStatus: { kind: 'resign', winner, loser } };
    }
    case 'agreeDraw':
      if (state.forcedStatus) return state;
      return { ...state, forcedStatus: { kind: 'drawAgreement' } };
    case 'timeout': {
      if (state.forcedStatus) return state;
      const loser = action.loser;
      const winner = oppositeColor(loser);
      return { ...state, forcedStatus: { kind: 'timeout', winner, loser } };
    }
    default:
      return state;
  }
}
