import type { TrainingPack, EndgameItem } from './schema';
import { makeItemKey, type TrainingItemKey } from './keys';
import type { EndgameRef } from './session/endgamesSession.types';

function isEndgame(it: any): it is EndgameItem {
  return it && typeof it === 'object' && it.type === 'endgame' && it.position && typeof it.position.fen === 'string';
}

export function buildEndgameRefs(packs: TrainingPack[]): EndgameRef[] {
  const out: EndgameRef[] = [];

  for (const p of packs) {
    for (const it of p.items) {
      if (!isEndgame(it)) continue;
      const key = makeItemKey(p.id, it.itemId) as TrainingItemKey;
      out.push({
        key,
        packId: p.id,
        itemId: it.itemId,
        difficulty: it.difficulty,
        fen: it.position.fen,
        goalText: it.goal,
        themes: it.themes ?? []
      });
    }
  }

  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}
