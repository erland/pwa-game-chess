import { render } from '@testing-library/react';
import { act } from 'react';
import { jest } from '@jest/globals';

import type { ChessAi } from '../domain/ai/types';
import type { AiConfig } from '../domain/ai/types';
import type { Color, GameState, Move } from '../domain/chessTypes';
import { createInitialGameState } from '../domain/gameState';
import { generateLegalMoves } from '../domain/legalMoves';
import { useAiController } from '../pages/game/useAiController';

function Harness(props: {
  enabled: boolean;
  state: GameState;
  isGameOver: boolean;
  aiColor: Color;
  ai: ChessAi | null;
  config: AiConfig;
  onApplyMove: (move: Move) => void;
}) {
  useAiController(props);
  return null;
}

describe('useAiController', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });
  it('calls getMove only when it is AI side to move', async () => {
    const getMove = jest.fn(async () => {
      throw new Error('not needed');
    });
    const ai: ChessAi = { getMove };
    const config: AiConfig = { difficulty: 'easy' };
    const onApplyMove = jest.fn();

    const s1 = createInitialGameState(); // white to move
    const { rerender } = render(
      <Harness
        enabled
        state={s1}
        isGameOver={false}
        aiColor="b"
        ai={ai}
        config={config}
        onApplyMove={onApplyMove}
      />
    );

    // Black AI should not be asked to move when White is to move.
    expect(getMove).not.toHaveBeenCalled();

    // Flip to black-to-move (simulate after a white move).
    const s2: GameState = { ...s1, sideToMove: 'b' };
    rerender(
      <Harness
        enabled
        state={s2}
        isGameOver={false}
        aiColor="b"
        ai={ai}
        config={config}
        onApplyMove={onApplyMove}
      />
    );

    // Let effects run.
    await act(async () => {
      await Promise.resolve();
    });

    expect(getMove).toHaveBeenCalledTimes(1);
  });

  it('cancels in-flight thinking so a stale result is not applied', async () => {
    jest.useFakeTimers();

    const onApplyMove = jest.fn();

    // Build a legal move for the initial position so the result is well-formed.
    const base = createInitialGameState();
    const legal = generateLegalMoves(base);
    const move = legal[0];

    const ai: ChessAi = {
      getMove: (_req, signal) =>
        new Promise((resolve, reject) => {
          const t = setTimeout(() => resolve({ move }), 50);
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    };

    const config: AiConfig = { difficulty: 'easy' };

    // Start on black-to-move so AI begins thinking.
    const s1: GameState = { ...base, sideToMove: 'b' };

    const { rerender, unmount } = render(
      <Harness
        enabled
        state={s1}
        isGameOver={false}
        aiColor="b"
        ai={ai}
        config={config}
        onApplyMove={onApplyMove}
      />
    );

    // Immediately switch turn away from AI (should cancel the request).
    const s2: GameState = { ...s1, sideToMove: 'w' };
    rerender(
      <Harness
        enabled
        state={s2}
        isGameOver={false}
        aiColor="b"
        ai={ai}
        config={config}
        onApplyMove={onApplyMove}
      />
    );

    await act(async () => {
      jest.advanceTimersByTime(100);
      // Flush microtasks.
      await Promise.resolve();
    });

    expect(onApplyMove).not.toHaveBeenCalled();

    unmount();
    jest.useRealTimers();
  });
});
