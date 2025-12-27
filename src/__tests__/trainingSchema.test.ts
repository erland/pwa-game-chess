import { validateTrainingPack, validateTrainingPackIndex } from '../domain/training/schema';

describe('training schema validation', () => {
  it('accepts a valid pack index', () => {
    const raw = {
      packs: [{ id: 'basic', title: 'Basic', file: 'basic.json', tags: ['a'] }]
    };

    const res = validateTrainingPackIndex(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.packs[0].id).toBe('basic');
    }
  });

  it('rejects an invalid pack', () => {
    const raw = {
      // id missing
      title: 'Nope',
      version: 1,
      author: 'x',
      license: 'y',
      tags: [],
      items: []
    };

    const res = validateTrainingPack(raw);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/pack\.id/i);
    }
  });

  it('accepts a minimal valid tactic pack', () => {
    const raw = {
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
    };

    const res = validateTrainingPack(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.items[0].type).toBe('tactic');
    }
  });
});
