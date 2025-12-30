import { useCallback, useEffect, useState } from 'react';

import { loadAllPacks, type PackLoadError } from '../../../domain/training/packLoader';
import type { TrainingPack } from '../../../domain/training/schema';

export type TrainingPacksState =
  | { status: 'loading' }
  | { status: 'ready'; packs: TrainingPack[]; errors: string[] }
  | { status: 'error'; message: string };

function mapErrors(errors: PackLoadError[] | undefined): string[] {
  if (!errors || errors.length === 0) return [];
  return errors.map((e) => e.message);
}

/**
 * Loads all training packs (built-in + custom).
 *
 * Keeps the UI/controller layer free from fetch + schema error plumbing.
 */
export function useTrainingPacks(): { state: TrainingPacksState; reload: () => void } {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<TrainingPacksState>({ status: 'loading' });

  const reload = useCallback(() => setReloadToken((x) => x + 1), []);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const res = await loadAllPacks();
        if (!alive) return;
        setState({ status: 'ready', packs: res.packs, errors: mapErrors(res.errors) });
      } catch (e) {
        if (!alive) return;
        setState({ status: 'error', message: (e as Error).message });
      }
    })();

    return () => {
      alive = false;
    };
  }, [reloadToken]);

  return { state, reload };
}
