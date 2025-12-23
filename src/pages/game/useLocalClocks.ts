import { useEffect, useMemo, useRef, useState } from 'react';

import type { GameState } from '../../domain/chessTypes';
import { oppositeColor } from '../../domain/chessTypes';
import type { TimeControl } from '../../domain/localSetup';
import type { GameAction } from '../../domain/reducer';

type ClockState = {
  wMs: number;
  bMs: number;
};

export function formatClockMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Local (on-device) chess clocks used for v1 "Local" mode.
 *
 * - Fischer increment is applied to the side that just moved.
 * - Active side counts down.
 * - Timeout dispatches a reducer action and is rendered via GameStatus.
 */
export function useLocalClocks(
  state: GameState,
  timeControl: TimeControl,
  isGameOver: boolean,
  dispatch: React.Dispatch<GameAction>
): {
  hasClock: boolean;
  clock: ClockState | null;
  clockInitialMs: number;
  clockIncrementMs: number;
} {
  const hasClock = timeControl.kind === 'fischer';

  const clockInitialMs = useMemo(
    () => (hasClock ? timeControl.initialSeconds * 1000 : 0),
    [hasClock, timeControl]
  );
  const clockIncrementMs = useMemo(
    () => (hasClock ? timeControl.incrementSeconds * 1000 : 0),
    [hasClock, timeControl]
  );

  const [clock, setClock] = useState<ClockState | null>(() => {
    if (!hasClock) return null;
    return { wMs: clockInitialMs, bMs: clockInitialMs };
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const lastTickRef = useRef<number | null>(null);
  const prevMoveCountRef = useRef<number>(0);

  // Reset clock when time control changes (or when entering the page).
  useEffect(() => {
    if (!hasClock) {
      setClock(null);
      return;
    }
    setClock({ wMs: clockInitialMs, bMs: clockInitialMs });
    lastTickRef.current = Date.now();
    prevMoveCountRef.current = 0;
  }, [hasClock, clockInitialMs]);

  // Apply Fischer increment to the player who just moved.
  useEffect(() => {
    if (!hasClock) return;

    const prevCount = prevMoveCountRef.current;
    const nextCount = state.history.length;

    if (nextCount > prevCount) {
      const mover = oppositeColor(state.sideToMove); // sideToMove already flipped
      if (clockIncrementMs > 0) {
        setClock((c) => {
          if (!c) return c;
          return mover === 'w' ? { ...c, wMs: c.wMs + clockIncrementMs } : { ...c, bMs: c.bMs + clockIncrementMs };
        });
      }
      lastTickRef.current = Date.now();
    }

    // Restart/new game: history is cleared.
    if (nextCount === 0 && prevCount > 0) {
      setClock({ wMs: clockInitialMs, bMs: clockInitialMs });
      lastTickRef.current = Date.now();
    }

    prevMoveCountRef.current = nextCount;
  }, [hasClock, clockIncrementMs, clockInitialMs, state.history.length, state.sideToMove]);

  // Tick down the active side.
  useEffect(() => {
    if (!hasClock) return;
    if (isGameOver) return;

    // If the clock starts at 0, end immediately.
    if (clockInitialMs <= 0) {
      dispatch({ type: 'timeout', loser: stateRef.current.sideToMove });
      return;
    }

    lastTickRef.current = Date.now();

    const id = window.setInterval(() => {
      const now = Date.now();
      const last = lastTickRef.current ?? now;
      const delta = Math.max(0, now - last);
      lastTickRef.current = now;

      const active = stateRef.current.sideToMove;
      let didTimeout = false;

      setClock((c) => {
        if (!c) return c;
        const next = { ...c };
        if (active === 'w') {
          next.wMs = Math.max(0, next.wMs - delta);
          if (next.wMs === 0) didTimeout = true;
        } else {
          next.bMs = Math.max(0, next.bMs - delta);
          if (next.bMs === 0) didTimeout = true;
        }
        return next;
      });

      if (didTimeout) {
        dispatch({ type: 'timeout', loser: active });
      }
    }, 200);

    return () => window.clearInterval(id);
  }, [hasClock, isGameOver, clockInitialMs, dispatch]);

  return { hasClock, clock, clockInitialMs, clockIncrementMs };
}
