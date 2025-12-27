import { loadBuiltInPacks } from '../domain/training/packLoader';
import { jest } from '@jest/globals';

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data
  } as Response);
}

describe('training pack loader', () => {
  it('loads packs listed in index.json', async () => {
    const fetchFn = jest.fn(async (url: string) => {
      if (url.endsWith('training/packs/index.json')) {
        return okJson({
          packs: [{ id: 'basic', title: 'Basic', file: 'basic.json' }]
        });
      }
      if (url.endsWith('training/packs/basic.json')) {
        return okJson({
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
              themes: ['mate'],
              position: { fen: '8/8/8/8/8/8/8/8 w - - 0 1' },
              solutions: [{ uci: 'a2a3' }]
            }
          ]
        });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as unknown as typeof fetch;

    const res = await loadBuiltInPacks(fetchFn, '/');
    expect(res.packs).toHaveLength(1);
    expect(res.errors).toHaveLength(0);
    expect(res.packs[0].id).toBe('basic');
  });

  it('returns errors for invalid pack but keeps working', async () => {
    const fetchFn = jest.fn(async (url: string) => {
      if (url.endsWith('training/packs/index.json')) {
        return okJson({
          packs: [
            { id: 'good', title: 'Good', file: 'good.json' },
            { id: 'bad', title: 'Bad', file: 'bad.json' }
          ]
        });
      }
      if (url.endsWith('training/packs/good.json')) {
        return okJson({
          id: 'good',
          title: 'Good',
          version: 1,
          author: 'me',
          license: 'CC0',
          tags: [],
          items: [
            {
              type: 'tactic',
              itemId: 't1',
              difficulty: 1,
              themes: ['mate'],
              position: { fen: '8/8/8/8/8/8/8/8 w - - 0 1' },
              solutions: [{ uci: 'a2a3' }]
            }
          ]
        });
      }
      if (url.endsWith('training/packs/bad.json')) {
        return okJson({
          id: 'bad',
          // title missing => invalid
          version: 1,
          author: 'me',
          license: 'CC0',
          tags: [],
          items: []
        });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as unknown as typeof fetch;

    const res = await loadBuiltInPacks(fetchFn, '/');
    expect(res.packs).toHaveLength(1);
    expect(res.packs[0].id).toBe('good');
    expect(res.errors.length).toBeGreaterThanOrEqual(1);
  });
});
