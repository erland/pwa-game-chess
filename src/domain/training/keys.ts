export type TrainingItemKey = `${string}:${string}`;

export function makeItemKey(packId: string, itemId: string): TrainingItemKey {
  return `${packId}:${itemId}` as TrainingItemKey;
}

/**
 * Validates a key string and returns it as a TrainingItemKey.
 * (Use splitItemKey() if you need the parts.)
 */
export function parseItemKey(key: unknown): TrainingItemKey | null {
  const parts = splitItemKey(key);
  if (!parts) return null;
  return makeItemKey(parts.packId, parts.itemId);
}

/** Splits a key into its parts. */
export function splitItemKey(key: unknown): { packId: string; itemId: string } | null {
  if (typeof key !== 'string') return null;
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const packId = key.slice(0, idx);
  const itemId = key.slice(idx + 1);
  if (!packId || !itemId) return null;
  return { packId, itemId };
}
