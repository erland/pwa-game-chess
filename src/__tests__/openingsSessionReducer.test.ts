import { createInitialGameState } from '../domain/gameState';
import { toFEN } from '../domain/notation/fen';

import { buildOpeningNodes } from '../domain/training/openingNodes';
import { uciToLegalMove } from '../domain/training/openingsDrill';
import { createOpeningsSessionState, reduceOpeningsSession } from '../domain/training/session/openingsSession';
import type { OpeningRef } from '../domain/training/session/openingsSession.types';

function makeOpeningRef(lineUci: string[]): OpeningRef {
  return {
    key: 'p1:o1',
    packId: 'p1',
    packTitle: 'Test Pack',
    item: {
      type: 'openingLine',
      itemId: 'o1',
      difficulty: 1,
      themes: ['test'],
      position: { fen: toFEN(createInitialGameState()) },
      line: lineUci
    },
    lineUci
  };
}

describe('openingsSession reducer (pure)', () => {
  test('line mode: correct move completes and records attempt', () => {
    const ref = makeOpeningRef(['e2e4', 'e7e5']);
    const s0 = createOpeningsSessionState({ mode: 'line', drillColor: 'w' });

    const r1 = reduceOpeningsSession(s0, { type: 'START_LINE', ref, nowMs: 1000 });
    expect(r1.state.running).toBe(true);
    expect(r1.state.current?.packId).toBe('p1');
    expect(r1.effects.length).toBe(0);

    const move = uciToLegalMove(r1.state.state!, 'e2e4');
    expect(move).not.toBeNull();

    const r2 = reduceOpeningsSession(r1.state, { type: 'APPLY_MOVE', move: move!, nowMs: 1500 });
    expect(r2.state.running).toBe(false);
    expect(r2.state.resultMsg).toMatch(/completed/i);
    expect(r2.effects.some((e) => e.kind === 'RECORD_LINE_ATTEMPT')).toBe(true);
    const eff = r2.effects.find((e) => e.kind === 'RECORD_LINE_ATTEMPT') as any;
    expect(eff.success).toBe(true);
  });

  test('nodes mode: correct move records node attempt and ends run', () => {
    const ref = makeOpeningRef(['e2e4', 'e7e5']);
    const nodesRes = buildOpeningNodes({
      packId: 'p1',
      packTitle: 'Test Pack',
      itemId: 'o1',
      name: 'Test Opening',
      startFen: ref.item.position.fen,
      lineUci: ref.lineUci,
      userColor: 'w'
    });
    const node = nodesRes.nodes[0];
    expect(node).toBeTruthy();

    const s0 = createOpeningsSessionState({ mode: 'nodes', drillColor: 'w' });
    const r1 = reduceOpeningsSession(s0, { type: 'START_NODE', node, nowMs: 2000 });
    expect(r1.state.running).toBe(true);
    expect(r1.state.currentNode?.key).toBe(node.key);

    const move = uciToLegalMove(r1.state.state!, 'e2e4');
    expect(move).not.toBeNull();
    const r2 = reduceOpeningsSession(r1.state, { type: 'APPLY_MOVE', move: move!, nowMs: 2400 });

    expect(r2.state.running).toBe(false);
    expect(r2.state.resultMsg).toMatch(/correct/i);
    expect(r2.effects.some((e) => e.kind === 'RECORD_NODE_ATTEMPT')).toBe(true);
    const eff = r2.effects.find((e) => e.kind === 'RECORD_NODE_ATTEMPT') as any;
    expect(eff.success).toBe(true);
    expect(eff.key).toBe(node.key);
  });
});
