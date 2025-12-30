import { useCallback, useEffect, useMemo, useState } from 'react';

import { listOpeningNodeStats, type OpeningNodeStats } from '../../../storage/training/openingNodeStore';

function sortStats(a: OpeningNodeStats, b: OpeningNodeStats): number {
  return (b.updatedAtMs - a.updatedAtMs) || a.key.localeCompare(b.key);
}

export type OpeningNodeStatsState =
  | { status: 'loading' }
  | { status: 'ready'; stats: OpeningNodeStats[] }
  | { status: 'error'; message: string };

export function useOpeningNodeStats(reloadKey: any): {
  state: OpeningNodeStatsState;
  byKey: Map<string, OpeningNodeStats>;
  reload: () => void;
  upsert: (next: OpeningNodeStats) => void;
  upsertMany: (next: OpeningNodeStats[]) => void;
} {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<OpeningNodeStatsState>({ status: 'loading' });

  const reload = useCallback(() => setReloadToken((x) => x + 1), []);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const all = await listOpeningNodeStats();
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
    const m = new Map<string, OpeningNodeStats>();
    for (const s of stats) m.set(s.key, s);
    return m;
  }, [stats]);

  const upsert = useCallback((next: OpeningNodeStats) => {
    setState((prev) => {
      if (prev.status !== 'ready') return prev;
      const map = new Map(prev.stats.map((s) => [s.key, s] as const));
      map.set(next.key, next);
      const merged = Array.from(map.values()).sort(sortStats);
      return { status: 'ready', stats: merged };
    });
  }, []);

  const upsertMany = useCallback((nextMany: OpeningNodeStats[]) => {
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
