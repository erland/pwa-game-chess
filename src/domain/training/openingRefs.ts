import type { OpeningLineItem, TrainingPack } from './schema';
import { isUciLike, normalizeUci } from './openingsDrill';
import type { OpeningRef } from './session/openingsSession.types';

export function buildOpeningRefs(packs: TrainingPack[]): { refs: OpeningRef[]; warnings: string[] } {
  const refs: OpeningRef[] = [];
  const warnings: string[] = [];

  for (const p of packs) {
    for (const it of p.items) {
      if (it.type !== 'openingLine') continue;
      const item = it as OpeningLineItem;

      // v1: item.line is intended to be UCI (SAN could be supported later)
      const rawMoves = item.line ?? [];
      const lineUci: string[] = [];
      const bad: string[] = [];

      for (const m of rawMoves) {
        if (isUciLike(m)) lineUci.push(normalizeUci(m));
        else bad.push(String(m));
      }

      if (lineUci.length === 0) {
        warnings.push(`Opening line ${p.id}:${item.itemId} has no UCI moves (line is empty or contains non-UCI moves).`);
        continue;
      }
      if (bad.length > 0) {
        warnings.push(`Opening line ${p.id}:${item.itemId} ignored non-UCI moves: ${bad.join(', ')}`);
      }

      refs.push({
        key: `${p.id}:${item.itemId}`,
        packId: p.id,
        packTitle: p.title,
        item,
        lineUci
      });
    }
  }

  refs.sort((a, b) => a.key.localeCompare(b.key));
  return { refs, warnings };
}
