import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { importPacksJson, listCustomPacks, deleteCustomPack } from '../storage/training/customPacksStore';
import type { TrainingPack } from '../domain/training/schema';

function samplePack(id: string): TrainingPack {
  return {
    id,
    title: `Pack ${id}`,
    version: 1,
    author: 'me',
    license: 'CC0',
    tags: [],
    items: []
  };
}

describe('custom packs store (fallback)', () => {
  const origIndexedDb = (globalThis as any).indexedDB;

  beforeEach(() => {
    // Force localStorage fallback in tests.
    (globalThis as any).indexedDB = undefined;
    localStorage.clear();
  });

  afterEach(() => {
    (globalThis as any).indexedDB = origIndexedDb;
  });

  it('imports a single pack and lists it', async () => {
    await importPacksJson(samplePack('custom1'));
    const rows = await listCustomPacks();
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('custom1');
    expect(rows[0].pack.title).toMatch(/custom1/i);
  });

  it('imports a bundle and can delete', async () => {
    const bundle = { packs: [samplePack('a'), samplePack('b')] };
    const n = await importPacksJson(bundle);
    expect(n).toBe(2);

    let rows = await listCustomPacks();
    expect(rows.map((r) => r.id).sort()).toEqual(['a', 'b']);

    await deleteCustomPack('a');
    rows = await listCustomPacks();
    expect(rows.map((r) => r.id)).toEqual(['b']);
  });
});
