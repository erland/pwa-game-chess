import { useCallback, useEffect, useMemo, useState } from 'react';

import { listItemStats, type TrainingItemStats } from '../../../storage/training/trainingStore';

function sortStats(a: TrainingItemStats, b: TrainingItemStats): number {
  return (b.updatedAtMs - a.updatedAtMs) || a.key.localeCompare(b.key);
}

export type TrainingItemStatsState =
  | { status: 'loading' }
  | { status: 'ready'; stats: TrainingItemStats[] }
  | { status: 'error'; message: string };

/**
 * Loads all item stats for training items and provides helpers to keep the in-memory
 * list in sync when you record attempts.
 */
export function useTrainingItemStats(reloadKey: any): {
  state: TrainingItemStatsState;
  byKey: Map<string, TrainingItemStats>;
  reload: () => void;
  upsert: (next: TrainingItemStats) => void;
  upsertMany: (next: TrainingItemStats[]) => void;
} {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<TrainingItemStatsState>({ status: 'loading' });

  const reload = useCallback(() => setReloadToken((x) => x + 1), []);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const all = await listItemStats();
        if (!alive) return;
        setState({ status: 'ready', stats: all });
      } catch (e) {
        if (!alive) return;
        setState({ status: 'error', message: (e as Error).message });
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadToken, reloadKey]);

  const stats = state.status === 'ready' ? state.stats : [];

  const byKey = useMemo(() => {
    const m = new Map<string, TrainingItemStats>();
    for (const s of stats) m.set(s.key, s);
    return m;
  }, [stats]);

  const upsert = useCallback((next: TrainingItemStats) => {
    setState((prev) => {
      if (prev.status !== 'ready') return prev;
      const map = new Map(prev.stats.map((s) => [s.key, s] as const));
      map.set(next.key, next);
      const merged = Array.from(map.values()).sort(sortStats);
      return { status: 'ready', stats: merged };
    });
  }, []);

  const upsertMany = useCallback((nextMany: TrainingItemStats[]) => {
    if (!nextMany || nextMany.length === 0) return;
    setState((prev) => {
      if (prev.status !== 'ready') return prev;
      const map = new Map(prev.stats.map((s) => [s.key, s] as const));
      for (const n of nextMany) map.set(n.key, n);
      const merged = Array.from(map.values()).sort(sortStats);
      return { status: 'ready', stats: merged };
    });
  }, []);

  return { state, byKey, reload, upsert, upsertMany };
}
