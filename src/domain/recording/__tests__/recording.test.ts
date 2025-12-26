import { startRecording } from '../recording';
import type { Move } from '../../chessTypes';

describe('recording (v3 Step 1)', () => {
  test('captures canonical move list deterministically', () => {
    const rec = startRecording({
      id: 'g1',
      mode: 'local',
      players: { white: 'White', black: 'Black' },
      timeControl: { kind: 'none' },
      startedAtMs: 1000,
      initialFen: null
    });

    const moves: Move[] = [
      { from: 12, to: 28 }, // e2 -> e4
      { from: 52, to: 36 }, // e7 -> e5
      { from: 6, to: 21 }, // g1 -> f3
      { from: 57, to: 42 }, // b8 -> c6
      { from: 52, to: 44, promotion: 'q' } // nonsense but tests promo capturing
    ];

    for (const m of moves) rec.recordMove(m);

    const record = rec.finalize({
      status: { kind: 'drawAgreement' },
      finishedAtMs: 2000,
      fallbackHistory: moves
    });

    expect(record.id).toBe('g1');
    expect(record.mode).toBe('local');
    expect(record.moves).toEqual([
      { from: 12, to: 28 },
      { from: 52, to: 36 },
      { from: 6, to: 21 },
      { from: 57, to: 42 },
      { from: 52, to: 44, promotion: 'q' }
    ]);
    expect(record.result).toEqual({ result: '1/2-1/2', termination: 'drawAgreement' });
  });
});
