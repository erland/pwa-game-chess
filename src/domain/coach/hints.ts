import type { CoachAnalysis, CoachHint, ProgressiveHintLevel } from './types';
import { parseUciMove } from '../notation/uci';

function firstMoveUci(a: CoachAnalysis): string | null {
  const pv0 = a.pv && a.pv.length > 0 ? a.pv[0] : null;
  return pv0 ?? a.bestMoveUci ?? null;
}

/**
 * Create a progressive hint based on analysis.
 *
 * Level 1: subtle nudge (from/to squares for highlighting)
 * Level 2: show the best move
 * Level 3: show the principal variation line
 */
export function getProgressiveHint(analysis: CoachAnalysis, level: ProgressiveHintLevel): CoachHint | null {
  const mv = firstMoveUci(analysis);
  if (!mv) return null;

  if (level === 3) {
    return { level: 3, kind: 'line', pv: analysis.pv && analysis.pv.length ? analysis.pv : [mv] };
  }

  const parsed = parseUciMove(mv);
  if (!parsed) return null;

  if (level === 2) {
    return { level: 2, kind: 'move', moveUci: mv, from: parsed.from, to: parsed.to };
  }

  // level 1
  return { level: 1, kind: 'nudge', from: parsed.from, to: parsed.to };
}
