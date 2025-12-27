import type { TrainingPack } from './schema';
import type { TrainingItemStats } from '../../storage/training/trainingStore';
import { makeItemKey } from './keys';

export interface ThemeAccuracyRow {
  theme: string;
  attempts: number;
  successes: number;
  accuracy: number; // 0..1
}

export function computeThemeAccuracy(packs: TrainingPack[], stats: TrainingItemStats[]): ThemeAccuracyRow[] {
  const byKey = new Map<string, TrainingItemStats>();
  for (const s of stats) byKey.set(s.key, s);

  const acc = new Map<string, { attempts: number; successes: number }>();

  for (const p of packs) {
    for (const it of p.items) {
      const key = makeItemKey(p.id, it.itemId);
      const s = byKey.get(key);
      if (!s || s.attempts <= 0) continue;
      for (const theme of it.themes ?? []) {
        const cur = acc.get(theme) ?? { attempts: 0, successes: 0 };
        cur.attempts += s.attempts;
        cur.successes += s.successes;
        acc.set(theme, cur);
      }
    }
  }

  const rows: ThemeAccuracyRow[] = Array.from(acc.entries()).map(([theme, v]) => ({
    theme,
    attempts: v.attempts,
    successes: v.successes,
    accuracy: v.attempts > 0 ? v.successes / v.attempts : 0
  }));

  // Lowest accuracy first ("weak spots"), then most attempts.
  rows.sort((a, b) => (a.accuracy - b.accuracy) || (b.attempts - a.attempts) || a.theme.localeCompare(b.theme));
  return rows;
}

export function recentMistakes(stats: TrainingItemStats[], limit = 20): TrainingItemStats[] {
  return stats
    .filter((s) => s.lastResult === 'fail')
    .slice()
    .sort((a, b) => (b.lastSeenAtMs - a.lastSeenAtMs) || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export function totalTimeSpentMs(stats: TrainingItemStats[]): number {
  return stats.reduce((sum, s) => sum + (s.totalSolveMs || 0), 0);
}

export function overallAccuracy(stats: TrainingItemStats[]): { attempts: number; successes: number; accuracy: number } {
  const attempts = stats.reduce((sum, s) => sum + (s.attempts || 0), 0);
  const successes = stats.reduce((sum, s) => sum + (s.successes || 0), 0);
  return { attempts, successes, accuracy: attempts > 0 ? successes / attempts : 0 };
}
