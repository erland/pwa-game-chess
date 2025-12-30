import { useEffect, type MutableRefObject } from 'react';

/**
 * Shared runner for reducer-produced side effects.
 *
 * Pattern:
 * - Reducer wrapper accumulates effects into effectsRef.current
 * - This hook drains that queue after React commits, and calls runEffect for each item.
 *
 * Keep runEffect stable (useCallback) and pass whatever dependencies should trigger a drain
 * (typically the session state object).
 */
export function useSessionEffectRunner<E>(
  effectsRef: MutableRefObject<E[]>,
  runEffect: (effect: E) => void,
  deps: any[]
): void {
  useEffect(() => {
    const pending = effectsRef.current;
    if (pending.length === 0) return;

    effectsRef.current = [];
    for (const eff of pending) runEffect(eff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runEffect, ...deps]);
}
