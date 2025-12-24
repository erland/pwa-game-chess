import { aiConfigFromDifficulty } from '../presets';

describe('ai presets', () => {
  it('maps easy/medium/hard to sensible time + randomness ranges', () => {
    const easy = aiConfigFromDifficulty('easy');
    const medium = aiConfigFromDifficulty('medium');
    const hard = aiConfigFromDifficulty('hard');

    // Time budgets (ms) roughly match the v2 plan ranges.
    expect(easy.thinkTimeMs).toBeGreaterThanOrEqual(50);
    expect(easy.thinkTimeMs).toBeLessThanOrEqual(150);

    expect(medium.thinkTimeMs).toBeGreaterThanOrEqual(150);
    expect(medium.thinkTimeMs).toBeLessThanOrEqual(450);

    expect(hard.thinkTimeMs).toBeGreaterThanOrEqual(400);
    expect(hard.thinkTimeMs).toBeLessThanOrEqual(1200);

    // Randomness decreases with difficulty.
    expect((easy.randomness ?? 0)).toBeGreaterThan((medium.randomness ?? 0));
    expect((medium.randomness ?? 0)).toBeGreaterThan((hard.randomness ?? 0));
  });

  it('applies custom overrides only for custom difficulty', () => {
    const c = aiConfigFromDifficulty('custom', undefined, { thinkTimeMs: 777, randomness: 0.9 });
    expect(c.difficulty).toBe('custom');
    expect(c.thinkTimeMs).toBe(777);
    expect(c.randomness).toBeCloseTo(0.9);

    const h = aiConfigFromDifficulty('hard', undefined, { thinkTimeMs: 777, randomness: 0.9 });
    // Presets should not be overridden.
    expect(h.difficulty).toBe('hard');
    expect(h.thinkTimeMs).not.toBe(777);
    expect(h.randomness).not.toBeCloseTo(0.9);
  });
});
