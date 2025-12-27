import { beforeEach, describe, expect, it } from '@jest/globals';
import type { TrainingPack } from '../domain/training/schema';
import { makeItemKey } from '../domain/training/keys';
import {
  buildDailyQueueItems,
  clearTrainingStore,
  getDailyQueue,
  getItemStats,
  recordAttempt,
  ensureDailyQueue,
  listItemStats
} from '../storage/training/trainingStore';

const DAY = 24 * 60 * 60 * 1000;

const packs: TrainingPack[] = [
  {
    id: 'basic',
    title: 'Basic',
    version: 1,
    author: 'me',
    license: 'CC0',
    tags: ['starter'],
    items: [
      {
        type: 'tactic',
        itemId: 't1',
        difficulty: 1,
        themes: ['fork'],
        position: { fen: '8/8/8/8/8/8/8/8 w - - 0 1' },
        solutions: [{ uci: 'a2a3' }]
      },
      {
        type: 'tactic',
        itemId: 't2',
        difficulty: 2,
        themes: ['pin'],
        position: { fen: '8/8/8/8/8/8/8/8 w - - 0 1' },
        solutions: [{ uci: 'a2a3' }]
      },
      {
        type: 'endgame',
        itemId: 'e1',
        difficulty: 2,
        themes: ['king+pawn'],
        position: { fen: '8/8/8/8/8/8/8/8 w - - 0 1' }
      }
    ]
  }
];

beforeEach(async () => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  await clearTrainingStore();
});

describe('training store (fallback)', () => {
  it('records attempts and schedules next due date', async () => {
    const now = 1_000_000;
    const s1 = await recordAttempt({ packId: 'basic', itemId: 't1', success: true, solveMs: 5000, nowMs: now });

    expect(s1.attempts).toBe(1);
    expect(s1.successes).toBe(1);
    expect(s1.streak).toBe(1);
    expect(s1.intervalDays).toBe(1);
    expect(s1.nextDueAtMs).toBe(now + DAY);

    const s2 = await recordAttempt({ packId: 'basic', itemId: 't1', success: true, solveMs: 3000, nowMs: now + 123 });
    expect(s2.attempts).toBe(2);
    expect(s2.successes).toBe(2);
    expect(s2.streak).toBe(2);
    expect(s2.intervalDays).toBe(3);
  });

  it('failure resets streak and schedules for tomorrow', async () => {
    const now = 2_000_000;
    await recordAttempt({ packId: 'basic', itemId: 't2', success: true, solveMs: 1000, nowMs: now });
    const fail = await recordAttempt({ packId: 'basic', itemId: 't2', success: false, solveMs: 2000, nowMs: now + 10 });

    expect(fail.lastResult).toBe('fail');
    expect(fail.streak).toBe(0);
    expect(fail.intervalDays).toBe(1);
    expect(fail.nextDueAtMs).toBe(now + 10 + DAY);
  });

  it('daily queue is deterministic given store state', async () => {
    const keyT1 = makeItemKey('basic', 't1');
    const keyT2 = makeItemKey('basic', 't2');
    const keyE1 = makeItemKey('basic', 'e1');

    // Make t1 due by recording it "yesterday".
    await recordAttempt({ packId: 'basic', itemId: 't1', success: true, solveMs: 1000, nowMs: 0 });
    const stats = await listItemStats();

    const items = buildDailyQueueItems(packs, stats, DAY + 1, { maxItems: 3, maxNew: 1 });
    expect(items[0]).toBe(keyT1); // due first
    // remaining are new, ordered by key
    expect(items).toContain(keyT2);
    expect(items).toContain(keyE1);
  });

  it('ensureDailyQueue persists per date', async () => {
    const date = '2025-12-27';
    const q1 = await ensureDailyQueue(packs, date, { maxItems: 2, maxNew: 2 }, 1234);
    const q2 = await getDailyQueue(date);
    expect(q2).not.toBeNull();
    expect(q2?.generatedAtMs).toBe(q1.generatedAtMs);
    expect(q2?.itemKeys.join(',')).toBe(q1.itemKeys.join(','));
  });

  it('getItemStats returns null for unknown key', async () => {
    const res = await getItemStats(makeItemKey('basic', 'nope'));
    expect(res).toBeNull();
  });
});
