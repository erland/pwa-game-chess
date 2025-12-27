import { gradeCpLoss, computeCpLoss } from '../domain/coach/grade';
import { getProgressiveHint } from '../domain/coach/hints';
import type { CoachAnalysis } from '../domain/coach/types';

describe('coach v1 - grading', () => {
  it('grades cp loss with expected thresholds', () => {
    expect(gradeCpLoss(0)).toBe('best');
    expect(gradeCpLoss(10)).toBe('best');
    expect(gradeCpLoss(11)).toBe('excellent');
    expect(gradeCpLoss(30)).toBe('excellent');
    expect(gradeCpLoss(31)).toBe('good');
    expect(gradeCpLoss(80)).toBe('good');
    expect(gradeCpLoss(81)).toBe('inaccuracy');
    expect(gradeCpLoss(150)).toBe('inaccuracy');
    expect(gradeCpLoss(151)).toBe('mistake');
    expect(gradeCpLoss(300)).toBe('mistake');
    expect(gradeCpLoss(301)).toBe('blunder');
  });

  it('computes cp loss as max(0, best - played)', () => {
    expect(computeCpLoss(100, 100)).toBe(0);
    expect(computeCpLoss(100, 80)).toBe(20);
    expect(computeCpLoss(80, 100)).toBe(0);
  });
});

describe('coach v1 - progressive hints', () => {
  const analysis: CoachAnalysis = {
    perspective: 'w',
    sideToMove: 'w',
    scoreCp: 42,
    bestMoveUci: 'e2e4',
    pv: ['e2e4', 'e7e5', 'g1f3']
  };

  it('level 1 returns a nudge with squares', () => {
    const h = getProgressiveHint(analysis, 1);
    expect(h && h.level).toBe(1);
  });

  it('level 2 returns the move', () => {
    const h = getProgressiveHint(analysis, 2);
    expect(h && h.level).toBe(2);
    if (h && h.level === 2) {
      expect(h.moveUci).toBe('e2e4');
    }
  });

  it('level 3 returns the pv line', () => {
    const h = getProgressiveHint(analysis, 3);
    expect(h && h.level).toBe(3);
    if (h && h.level === 3) {
      expect(h.pv.length).toBeGreaterThan(1);
    }
  });
});
