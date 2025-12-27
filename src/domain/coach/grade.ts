import type { CoachGradeLabel } from './types';

/**
 * Convert centipawn loss into a coarse grading label.
 *
 * These thresholds are intentionally simple and can be tuned later.
 */
export function gradeCpLoss(cpLoss: number): CoachGradeLabel {
  const l = Math.max(0, Math.floor(cpLoss));
  if (l <= 10) return 'best';
  if (l <= 30) return 'excellent';
  if (l <= 80) return 'good';
  if (l <= 150) return 'inaccuracy';
  if (l <= 300) return 'mistake';
  return 'blunder';
}

export function computeCpLoss(bestScoreCp: number | undefined, playedScoreCp: number | undefined): number {
  const b = typeof bestScoreCp === 'number' && Number.isFinite(bestScoreCp) ? bestScoreCp : 0;
  const p = typeof playedScoreCp === 'number' && Number.isFinite(playedScoreCp) ? playedScoreCp : 0;
  // Higher is better for the same perspective.
  return Math.max(0, Math.round(b - p));
}
