import { tryParseFEN } from '../domain/notation/fen';
import { generateLegalMoves } from '../domain/legalMoves';
import { moveToUci } from '../domain/notation/uci';

import { createEndgamesSessionState, reduceEndgamesSession } from '../domain/training/session/endgamesSession';
import type { EndgameRef } from '../domain/training/session/endgamesSession.types';

function refWithFen(fen: string, goalText?: string): EndgameRef {
  return {
    key: 'pack:item' as any,
    packId: 'pack',
    itemId: 'item',
    difficulty: 1,
    fen,
    goalText,
    themes: []
  };
}

describe('endgamesSession reducer', () => {
  test('promotion goal finishes on a promoting move and emits PERSIST_FINISH', () => {
    // White pawn on a7 can promote on a8.
    const fen = '8/P7/8/8/8/4k3/8/4K3 w - - 0 1';
    const parsed = tryParseFEN(fen);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const ref = refWithFen(fen, 'Promote a pawn');

    const start = reduceEndgamesSession(createEndgamesSessionState(), {
      type: 'START',
      ref,
      baseState: parsed.value,
      nowMs: 1000
    });

    expect(start.state.ref).toBeTruthy();
    expect(start.state.result).toBeNull();

    const legal = generateLegalMoves(start.state.state!);
    const promo = legal.find((m) => moveToUci(m).startsWith('a7a8') && m.promotion);
    expect(promo).toBeTruthy();
    if (!promo) return;

    const after = reduceEndgamesSession(start.state, { type: 'USER_MOVE', move: promo, nowMs: 2500 });
    expect(after.state.result).toBeTruthy();
    expect(after.state.result?.success).toBe(true);
    expect(after.effects.some((e) => e.kind === 'PERSIST_FINISH')).toBe(true);
  });

  test('requesting a hint emits ANALYZE_HINT and resolution stores analysis/hint', () => {
    // Use a clearly non-terminal position (avoid immediate insufficient-material draw)
    // so the session is in progress and hints are allowed.
    const fen = '4k3/8/8/8/8/8/8/4K2R w - - 0 1';
    const parsed = tryParseFEN(fen);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const ref = refWithFen(fen, 'Win');
    const started = reduceEndgamesSession(createEndgamesSessionState(), { type: 'START', ref, baseState: parsed.value, nowMs: 1 });
    const req = reduceEndgamesSession(started.state, { type: 'REQUEST_HINT', level: 1, nowMs: 2 });

    const hintEff = req.effects.find((e) => e.kind === 'ANALYZE_HINT');
    expect(hintEff).toBeTruthy();
    if (!hintEff || hintEff.kind !== 'ANALYZE_HINT') return;

    // minimal fake analysis shape (only fields used by getProgressiveHint)
    const analysis: any = { bestMoveUci: 'h1h8', pv: ['h1h8'], scoreCp: 0, sideToMove: 'w' };
    const resolved = reduceEndgamesSession(req.state, { type: 'HINT_ANALYSIS_RESOLVED', requestId: hintEff.requestId, analysis });
    expect(resolved.state.analysis).toBeTruthy();
    expect(resolved.state.hint).toBeTruthy();
  });
});
