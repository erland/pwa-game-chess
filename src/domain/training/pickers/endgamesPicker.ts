import type { TrainingItemKey } from '../keys';
import type { EndgameRef } from '../session/endgamesSession.types';

import type { TrainingItemStatsLike } from './statsLike';

/**
 * Pick the next endgame drill to train.
 *
 * Policy:
 *  - If a focus key exists, use it.
 *  - Prefer due, then fresh, then least-recently-seen.
 *  - For due/fresh buckets we do a deterministic pseudo-random pick to add variety.
 */
export function pickNextEndgame(
  refs: EndgameRef[],
  stats: TrainingItemStatsLike[],
  ts: number,
  focus: TrainingItemKey | null
): EndgameRef | null {
  if (refs.length === 0) return null;
  if (focus) {
    const f = refs.find((r) => r.key === focus);
    if (f) return f;
  }

  const byKey = new Map<string, TrainingItemStatsLike>();
  for (const s of stats) byKey.set(s.key, s);

  const due: EndgameRef[] = [];
  const fresh: EndgameRef[] = [];
  const seen: EndgameRef[] = [];

  for (const r of refs) {
    const st = byKey.get(r.key);
    if (!st) {
      fresh.push(r);
      continue;
    }
    const nextDue = st.nextDueAtMs ?? 0;
    if (nextDue > 0 && nextDue <= ts) due.push(r);
    else seen.push(r);
  }

  const pick = (arr: EndgameRef[]) => arr[Math.floor((ts / 997) % arr.length)];
  if (due.length) return pick(due);
  if (fresh.length) return pick(fresh);

  seen.sort((a, b) => (byKey.get(a.key)?.lastSeenAtMs ?? 0) - (byKey.get(b.key)?.lastSeenAtMs ?? 0));
  return seen[0] ?? refs[0];
}
