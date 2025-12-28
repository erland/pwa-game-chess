import { describe, it, expect } from '@jest/globals';

import { computeEndgameMoveFeedback, suggestAutoCheckpoint } from '../domain/training/endgameDrift';
import type { CoachMoveGrade } from '../domain/coach/types';
import { parseEndgameGoal } from '../domain/training/endgameGoals';

function grade(partial: Partial<CoachMoveGrade>): CoachMoveGrade {
  return {
    label: partial.label ?? 'best',
    cpLoss: partial.cpLoss ?? 0,
    bestMoveUci: partial.bestMoveUci,
    playedMoveUci: partial.playedMoveUci,
    bestScoreCp: partial.bestScoreCp,
    playedScoreCp: partial.playedScoreCp
  };
}

describe('endgameDrift', () => {
  it('flags drift when winning position drops sharply (win goal)', () => {
    const goal = parseEndgameGoal('Win');
    const fb = computeEndgameMoveFeedback(
      goal,
      grade({ label: 'mistake', cpLoss: 220, bestScoreCp: 450, playedScoreCp: 230, bestMoveUci: 'e2e4' })
    );
    expect(fb).toBeTruthy();
    expect(fb?.severity).toBe('mistake');
  });

  it('does not flag drift if not clearly winning yet (win goal)', () => {
    const goal = parseEndgameGoal('Win');
    const fb = computeEndgameMoveFeedback(
      goal,
      grade({ label: 'mistake', cpLoss: 220, bestScoreCp: 80, playedScoreCp: -140 })
    );
    expect(fb).toBeNull();
  });

  it('flags drift when holdable draw becomes clearly losing (draw goal)', () => {
    const goal = parseEndgameGoal('Draw');
    const fb = computeEndgameMoveFeedback(
      goal,
      grade({ label: 'blunder', cpLoss: 320, bestScoreCp: 20, playedScoreCp: -300, bestMoveUci: 'a1a2' })
    );
    expect(fb).toBeTruthy();
    expect(fb?.severity).toBe('blunder');
  });

  it('suggests auto checkpoint for winning positions after good move', () => {
    const goal = parseEndgameGoal('Win');
    const s = suggestAutoCheckpoint(goal, 420, 'good', undefined);
    expect(s).toBeTruthy();
    expect(s?.label.toLowerCase()).toContain('key position');
  });

  it('suggests auto checkpoint for drawish positions after good move (draw goal)', () => {
    const goal = parseEndgameGoal('Draw');
    const s = suggestAutoCheckpoint(goal, 15, 'excellent', undefined);
    expect(s).toBeTruthy();
  });
});
