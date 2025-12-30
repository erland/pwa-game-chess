import type { TrainingPack, TacticItem } from './schema';
import type { TacticRef } from './session/tacticsSession.types';

function isTactic(it: any): it is TacticItem {
  return it && typeof it === 'object' && it.type === 'tactic' && Array.isArray(it.solutions);
}

export function buildTacticRefs(packs: TrainingPack[]): TacticRef[] {
  const out: TacticRef[] = [];
  for (const p of packs) {
    for (const it of p.items) {
      if (isTactic(it)) out.push({ pack: p, item: it });
    }
  }
  out.sort((a, b) => a.pack.title.localeCompare(b.pack.title) || a.item.itemId.localeCompare(b.item.itemId));
  return out;
}
