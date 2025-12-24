import type { AiConfig, AiDifficulty } from './types';

/**
 * v2 Step 3: Basic difficulty→config mapping for the baseline bot.
 *
 * This is intentionally simple; v2 Step 5 can tune these values later.
 */
export function aiConfigFromDifficulty(difficulty: AiDifficulty, seed?: number): AiConfig {
  switch (difficulty) {
    case 'easy':
      return { difficulty, thinkTimeMs: 80, maxDepth: 1, randomness: 0.85, seed };
    case 'medium':
      return { difficulty, thinkTimeMs: 200, maxDepth: 1, randomness: 0.35, seed };
    case 'hard':
      return { difficulty, thinkTimeMs: 450, maxDepth: 2, randomness: 0.05, seed };
    case 'custom':
    default:
      return { difficulty, thinkTimeMs: 250, maxDepth: 1, randomness: 0.25, seed };
  }
}
