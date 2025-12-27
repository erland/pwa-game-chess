export type TrainingItemKey = `${string}:${string}`;

export function makeItemKey(packId: string, itemId: string): TrainingItemKey {
  return `${packId}:${itemId}` as TrainingItemKey;
}

export function parseItemKey(key: string): { packId: string; itemId: string } | null {
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const packId = key.slice(0, idx);
  const itemId = key.slice(idx + 1);
  if (!packId || !itemId) return null;
  return { packId, itemId };
}
