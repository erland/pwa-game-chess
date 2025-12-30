import type { TrainingItemKey } from '../keys';
import type { OpeningRef } from '../session/openingsSession.types';

import type { TrainingItemStatsLike } from './statsLike';

/**
 * Pick the next opening line drill to train.
 *
 * Policy (deterministic):
 *  - If focusKey is provided and exists, pick it.
 *  - Prefer due items.
 *  - Otherwise prefer fresh (never attempted) items.
 *  - Otherwise least-recently seen.
 */
export function pickNextOpening(
  refs: OpeningRef[],
  stats: TrainingItemStatsLike[],
  ts: number,
  focusKey?: TrainingItemKey | null
): OpeningRef | null {
  if (refs.length === 0) return null;

  if (focusKey) {
    const f = refs.find((r) => r.key === focusKey);
    if (f) return f;
  }

  const byKey = new Map<string, TrainingItemStatsLike>();
  for (const s of stats) byKey.set(s.key, s);

  const due: OpeningRef[] = [];
  const fresh: OpeningRef[] = [];
  const seen: OpeningRef[] = [];

  for (const r of refs) {
    const s = byKey.get(r.key);
    if (!s || (s.attempts || 0) === 0) fresh.push(r);
    else if ((s.nextDueAtMs || 0) <= ts) due.push(r);
    else seen.push(r);
  }

  const byKeyAsc = (a: OpeningRef, b: OpeningRef) => a.key.localeCompare(b.key);
  due.sort(byKeyAsc);
  fresh.sort(byKeyAsc);
  seen.sort((a, b) => {
    const sa = byKey.get(a.key)?.lastSeenAtMs || 0;
    const sb = byKey.get(b.key)?.lastSeenAtMs || 0;
    if (sa !== sb) return sa - sb;
    return a.key.localeCompare(b.key);
  });

  return due[0] ?? fresh[0] ?? seen[0] ?? null;
}
