import { createInitialGameState } from '../domain/gameState';
import { findBestMoveStrong } from '../domain/ai/strongSearch';
import { moveToUci } from '../domain/notation/uci';

describe('strong search PV', () => {
  it('includes a PV starting with the chosen move', () => {
    const state = createInitialGameState();
    const env = { nowMs: () => 0, shouldAbort: () => false };

    const r = findBestMoveStrong(env, {
      state,
      aiColor: state.sideToMove,
      config: { difficulty: 'custom', maxDepth: 3, randomness: 0, seed: 1 }
    });

    const uci = moveToUci(r.move);
    expect(r.meta?.pv).toBeTruthy();
    expect(r.meta?.pv?.length).toBeGreaterThan(0);
    expect(r.meta?.pv?.[0]).toBe(uci);
  });
});
