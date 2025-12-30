/**
 * Minimal stats shape used by pickers.
 *
 * This intentionally avoids importing storage-layer types so the domain pickers
 * stay pure and dependency-light.
 */
export type TrainingItemStatsLike = {
  key: string;
  attempts?: number;
  nextDueAtMs?: number;
  updatedAtMs?: number;
  lastSeenAtMs?: number;
};
