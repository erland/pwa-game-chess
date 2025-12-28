import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { loadAllPacks } from '../domain/training/packLoader';
import { importPacksJson } from '../storage/training/customPacksStore';
import type { TrainingPack } from '../domain/training/schema';

function okJson(obj: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => obj
  } as unknown as Response;
}

function samplePack(id: string, title: string): TrainingPack {
  return { id, title, version: 1, author: 'me', license: 'CC0', tags: [], items: [] };
}

describe('loadAllPacks', () => {
  const origIndexedDb = (globalThis as any).indexedDB;

  beforeEach(() => {
    (globalThis as any).indexedDB = undefined; // force fallback custom pack store
    localStorage.clear();
  });

  afterEach(() => {
    (globalThis as any).indexedDB = origIndexedDb;
  });

  it('merges custom packs and built-in packs (custom overrides)', async () => {
    // Built-in index with one pack "basic".
    const fetchFn = async (url: string) => {
      if (url.endsWith('training/packs/index.json')) {
        return okJson({ packs: [{ id: 'basic', title: 'Basic', file: 'basic.json' }] });
      }
      if (url.endsWith('training/packs/basic.json')) {
        return okJson(samplePack('basic', 'Built-in Basic'));
      }
      throw new Error('unexpected url ' + url);
    };

    // Custom pack with same id overrides.
    await importPacksJson(samplePack('basic', 'My Custom Basic'));
    await importPacksJson(samplePack('extra', 'Extra Pack'));

    const res = await loadAllPacks(fetchFn as any, '/');
    const titles = res.packs.map((p) => p.title);

    expect(titles).toContain('My Custom Basic');
    expect(titles).toContain('Extra Pack');
    expect(res.packs.find((p) => p.id === 'basic')?.title).toBe('My Custom Basic');
    expect(res.errors.some((e) => (e.packId ?? '') === 'basic' && /overrides/i.test(e.message))).toBe(true);
  });
});
