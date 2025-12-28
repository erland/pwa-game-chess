import { describe, expect, it, beforeEach } from '@jest/globals';
import { makeItemKey } from '../domain/training/keys';
import { clearLessonProgress, getLessonProgress, listLessonProgress, saveLessonProgress } from '../storage/training/lessonProgressStore';

describe('lessonProgressStore (fallback)', () => {
  beforeEach(() => {
    // Force fallback mode.
    (globalThis as any).indexedDB = undefined;
    localStorage.clear();
  });

  it('saves and reads lesson progress', async () => {
    const key = makeItemKey('basic', 'lesson-basics-001');
    await clearLessonProgress(key);

    expect(await getLessonProgress(key)).toBeNull();

    await saveLessonProgress(key, 2);
    const rec = await getLessonProgress(key);
    expect(rec).not.toBeNull();
    expect(rec?.key).toBe(key);
    expect(rec?.currentBlockIndex).toBe(2);
  });

  it('marks completion without losing progress', async () => {
    const key = makeItemKey('basic', 'lesson-basics-001');
    await saveLessonProgress(key, 1);
    await saveLessonProgress(key, 3, { completed: true });

    const rec = await getLessonProgress(key);
    expect(rec?.completedAtMs).toBeDefined();
    expect(rec?.currentBlockIndex).toBe(3);
  });

  it('lists newest first', async () => {
    const a = makeItemKey('basic', 'lesson-a');
    const b = makeItemKey('basic', 'lesson-b');

    await saveLessonProgress(a, 0);
    await new Promise((r) => setTimeout(r, 1));
    await saveLessonProgress(b, 0);

    const list = await listLessonProgress(10);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].key).toBe(b);
  });
});
