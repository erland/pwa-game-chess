import { createTacticsAttempt, reduceTacticsAttempt } from '../domain/training/session/tacticsSession';
import type { TrainingPack, TacticItem } from '../domain/training/schema';
import { uciToLegalMove } from '../domain/training/tactics';

import type { TacticRef } from '../domain/training/session/tacticsSession.types';

function makeRef(): TacticRef {
  const item: TacticItem = {
    type: 'tactic',
    itemId: 't1',
    difficulty: 1,
    themes: ['test'],
    position: { fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1' },
    solutions: [{ lineUci: ['e2e4'] }]
  };

  const pack: TrainingPack = {
    id: 'p1',
    title: 'Test Pack',
    version: 2,
    author: 'test',
    license: 'MIT',
    tags: [],
    items: [item]
  };

  return { pack, item };
}

describe('tacticsSession reducer (pure)', () => {
  test('correct move completes and records attempt', () => {
    const ref = makeRef();
    const s0 = createTacticsAttempt(ref, 1000, 'tok');
    const move = uciToLegalMove(s0.state, 'e2e4');
    expect(move).not.toBeNull();

    const res = reduceTacticsAttempt(s0, { type: 'USER_MOVE', move: move!, nowMs: 1500 });
    expect(res.state).not.toBeNull();
    const s1 = res.state!;

    expect(s1.result?.correct).toBe(true);
    expect(s1.pendingGrade).toBe(true);

    const kinds = res.effects.map((e) => e.kind);
    expect(kinds).toContain('GRADE_MOVE');
    expect(kinds).toContain('RECORD_ATTEMPT');

    const record = res.effects.find((e) => e.kind === 'RECORD_ATTEMPT') as any;
    expect(record.success).toBe(true);
  });

  test('wrong move ends attempt and records failure', () => {
    const ref = makeRef();
    const s0 = createTacticsAttempt(ref, 2000, 'tok');
    const move = uciToLegalMove(s0.state, 'e2e3');
    expect(move).not.toBeNull();

    const res = reduceTacticsAttempt(s0, { type: 'USER_MOVE', move: move!, nowMs: 2500 });
    const s1 = res.state!;

    expect(s1.result?.correct).toBe(false);

    const record = res.effects.find((e) => e.kind === 'RECORD_ATTEMPT') as any;
    expect(record).toBeTruthy();
    expect(record.success).toBe(false);
  });

  test('request hint triggers analyze, then analysis resolves into hint', () => {
    const ref = makeRef();
    const s0 = createTacticsAttempt(ref, 1000, 'tok');

    const r1 = reduceTacticsAttempt(s0, { type: 'REQUEST_HINT', level: 1 });
    expect(r1.state?.pendingAnalysis).toBe(true);
    expect(r1.effects.some((e) => e.kind === 'ANALYZE')).toBe(true);

    const analysis = {
      perspective: 'w',
      sideToMove: 'w',
      scoreCp: 0,
      mateIn: undefined,
      bestMoveUci: 'e2e4',
      pv: ['e2e4'],
      depth: 1,
      nodes: 1,
      timeMs: 1
    };

    const r2 = reduceTacticsAttempt(r1.state!, { type: 'ANALYSIS_RESOLVED', attemptToken: 'tok', analysis: analysis as any });
    expect(r2.state?.analysis).toBeTruthy();
    expect(r2.state?.hint).toBeTruthy();
    expect(r2.state?.hintLevel).toBe(1);
  });
});
