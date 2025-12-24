import type { AiConfig, AiDifficulty } from './types';

/**
 * v2 Step 5: Difficulty→config mapping for the baseline bot.
 *
 * Keep these values reasonably stable and treat them as "defaults".
 * UI may override some fields (currently thinkTimeMs + randomness) for Custom difficulty.
 */

export type AiConfigOverrides = Partial<Pick<AiConfig, 'thinkTimeMs' | 'randomness' | 'maxDepth' | 'seed'>>;

export function aiConfigFromDifficulty(
  difficulty: AiDifficulty,
  seed?: number,
  overrides?: AiConfigOverrides
): AiConfig {
  const base: AiConfig =
    difficulty === 'easy'
      ? { difficulty, thinkTimeMs: 110, maxDepth: 1, randomness: 0.85, seed }
      : difficulty === 'medium'
        ? { difficulty, thinkTimeMs: 260, maxDepth: 1, randomness: 0.35, seed }
        : difficulty === 'hard'
          ? { difficulty, thinkTimeMs: 850, maxDepth: 2, randomness: 0.06, seed }
          : { difficulty, thinkTimeMs: 300, maxDepth: 1, randomness: 0.25, seed };

  // Only apply overrides for Custom (to preserve the meaning of presets).
  if (difficulty !== 'custom' || !overrides) return base;

  const thinkTimeMs = clampInt(overrides.thinkTimeMs ?? base.thinkTimeMs ?? 300, 10, 10_000);
  const randomness = clampFloat(overrides.randomness ?? base.randomness ?? 0.25, 0, 1);

  return {
    ...base,
    thinkTimeMs,
    randomness,
    maxDepth: overrides.maxDepth ?? base.maxDepth,
    seed: overrides.seed ?? base.seed
  };
}

function clampInt(v: number, min: number, max: number): number {
  const n = Math.round(v);
  return Math.min(max, Math.max(min, n));
}

function clampFloat(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}
