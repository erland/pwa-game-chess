import type { GameState, Move } from './chessTypes';
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
  | { type: 'applyMove'; move: Move };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'newGame':
      return createInitialGameState();
    case 'applyMove':
      return applyMove(state, action.move);
    default:
      return state;
  }
}
