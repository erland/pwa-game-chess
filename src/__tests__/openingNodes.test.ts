import { describe, expect, it } from '@jest/globals';

import { buildOpeningNodes, pickNextOpeningNode } from '../domain/training/openingNodes';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('opening nodes', () => {
  it('builds one node per user decision point', () => {
    const lineUci = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];

    const white = buildOpeningNodes({
      packId: 'p',
      packTitle: 'Pack',
      itemId: 'it',
      name: 'Line',
      startFen: START_FEN,
      lineUci,
      userColor: 'w'
    });

    expect(white.nodes.map((n) => n.plyIndex)).toEqual([0, 2]);
    expect(white.nodes[0]?.expectedUci).toBe('e2e4');
    expect(white.nodes[1]?.expectedUci).toBe('g1f3');

    const black = buildOpeningNodes({
      packId: 'p',
      packTitle: 'Pack',
      itemId: 'it',
      name: 'Line',
      startFen: START_FEN,
      lineUci,
      userColor: 'b'
    });

    expect(black.nodes.map((n) => n.plyIndex)).toEqual([1, 3]);
    expect(black.nodes[0]?.expectedUci).toBe('e7e5');
    expect(black.nodes[1]?.expectedUci).toBe('b8c6');
  });

  it('picks due nodes before unseen nodes', () => {
    const nodes = buildOpeningNodes({
      packId: 'p',
      packTitle: 'Pack',
      itemId: 'it',
      name: 'Line',
      startFen: START_FEN,
      lineUci: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
      userColor: 'w'
    }).nodes;

    const ts = 1_000_000;
    const stats = [
      { key: nodes[1]!.key, attempts: 2, lastSeenAtMs: ts - 1000, nextDueAtMs: ts - 1 },
      { key: nodes[0]!.key, attempts: 0, lastSeenAtMs: 0, nextDueAtMs: 0 }
    ];

    const picked = pickNextOpeningNode(nodes, stats, ts);
    expect(picked?.key).toBe(nodes[1]!.key);
  });
});
