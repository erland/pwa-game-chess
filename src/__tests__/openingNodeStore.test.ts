import { describe, expect, it } from '@jest/globals';

import {
  clearOpeningNodeStore,
  getOpeningNodeStats,
  recordOpeningNodeAttempt
} from '../storage/training/openingNodeStore';

describe('opening node store', () => {
  it('records attempts and schedules next due', async () => {
    await clearOpeningNodeStore();

    const now = 1000;
    const key = 'pack:item#0';

    const a = await recordOpeningNodeAttempt({
      key,
      packId: 'pack',
      itemId: 'item',
      plyIndex: 0,
      success: true,
      solveMs: 500,
      nowMs: now
    });

    expect(a.attempts).toBe(1);
    expect(a.successes).toBe(1);
    expect(a.nextDueAtMs).toBeGreaterThan(now);

    const loaded = await getOpeningNodeStats(key);
    expect(loaded?.attempts).toBe(1);
  });
});
