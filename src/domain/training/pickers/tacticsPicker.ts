import { makeItemKey, type TrainingItemKey } from '../keys';
import type { TacticRef } from '../session/tacticsSession.types';

import type { TrainingItemStatsLike } from './statsLike';

/**
 * Pick the next tactic to train.
 *
 * Policy (deterministic):
 *  - Prefer due (or never-seen) items.
 *  - Among due items: earlier due date first, then fewer attempts.
 *  - Otherwise: least-attempted, then least recently updated.
 */
export function pickNextTactic(refs: TacticRef[], stats: TrainingItemStatsLike[], ts: number): TacticRef | null {
  if (refs.length === 0) return null;

  const byKey = new Map<TrainingItemKey, TrainingItemStatsLike>();
  for (const s of stats) byKey.set(s.key as TrainingItemKey, s);

  const due: Array<{ ref: TacticRef; s: TrainingItemStatsLike | null }> = [];
  for (const ref of refs) {
    const key = makeItemKey(ref.pack.id, ref.item.itemId);
    const s = byKey.get(key) ?? null;
    if (!s || (s.nextDueAtMs || 0) <= ts) {
      due.push({ ref, s });
    }
  }

  if (due.length > 0) {
    due.sort((a, b) => {
      const ad = a.s ? a.s.nextDueAtMs : 0;
      const bd = b.s ? b.s.nextDueAtMs : 0;
      if (ad !== bd) return (ad || 0) - (bd || 0);
      const aa = a.s ? a.s.attempts : 0;
      const ba = b.s ? b.s.attempts : 0;
      if (aa !== ba) return (aa || 0) - (ba || 0);
      return makeItemKey(a.ref.pack.id, a.ref.item.itemId).localeCompare(makeItemKey(b.ref.pack.id, b.ref.item.itemId));
    });
    return due[0].ref;
  }

  const scored = refs
    .map((ref) => {
      const key = makeItemKey(ref.pack.id, ref.item.itemId);
      const s = byKey.get(key);
      return { ref, attempts: s?.attempts ?? 0, updated: s?.updatedAtMs ?? 0 };
    })
    .sort(
      (a, b) =>
        (a.attempts - b.attempts) ||
        (a.updated - b.updated) ||
        makeItemKey(a.ref.pack.id, a.ref.item.itemId).localeCompare(makeItemKey(b.ref.pack.id, b.ref.item.itemId))
    );

  return scored[0]?.ref ?? null;
}
