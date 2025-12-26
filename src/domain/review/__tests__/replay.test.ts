import type { GameState } from '../../chessTypes';
import { createInitialGameState } from '../../gameState';
import { generateLegalMoves } from '../../legalMoves';
import { applyMove } from '../../applyMove';
import { toMoveRecord, type GameRecord } from '../../recording/types';
import { replayGameRecord } from '../replay';

function pickMove(state: GameState, from: number, to: number, promotion?: any) {
  const legal = generateLegalMoves(state);
  const m = legal.find((x) => x.from === from && x.to === to && x.promotion === promotion);
  if (!m) throw new Error(`Illegal move in test: ${from}->${to}`);
  return m;
}

describe('review replay', () => {
  it('replays a record deterministically and matches direct application', () => {
    let s = createInitialGameState();

    // e2e4, e7e5, g1f3, b8c6 (using 0..63 squares: a1=0, h8=63)
    const m1 = pickMove(s, 12, 28); // e2 -> e4
    s = applyMove(s, m1);
    const m2 = pickMove(s, 52, 36); // e7 -> e5
    s = applyMove(s, m2);
    const m3 = pickMove(s, 6, 21); // g1 -> f3
    s = applyMove(s, m3);
    const m4 = pickMove(s, 57, 42); // b8 -> c6
    s = applyMove(s, m4);

    const record: GameRecord = {
      id: 'test-1',
      startedAtMs: 0,
      finishedAtMs: 1,
      mode: 'local',
      players: { white: 'Alice', black: 'Bob' },
      timeControl: { kind: 'none' },
      moves: [toMoveRecord(m1), toMoveRecord(m2), toMoveRecord(m3), toMoveRecord(m4)],
      result: { result: '1-0', termination: 'resign', winner: 'w', loser: 'b' }
    };

    const replay = replayGameRecord(record);

    expect(replay.ok).toBe(true);
    expect(replay.errors).toHaveLength(0);
    expect(replay.frames).toHaveLength(record.moves.length + 1);

    const last = replay.frames[replay.frames.length - 1].state;

    // Deep equality is fine here (board is a JSON-ish structure)
    expect(last).toEqual(s);
  });

  it('detects illegal recorded moves when validation is enabled', () => {
    const record: GameRecord = {
      id: 'test-2',
      startedAtMs: 0,
      finishedAtMs: 1,
      mode: 'local',
      players: { white: 'Alice', black: 'Bob' },
      timeControl: { kind: 'none' },
      moves: [
        // illegal: e2 -> e5 from starting position
        { from: 12, to: 36 }
      ],
      result: { result: '0-1', termination: 'resign', winner: 'b', loser: 'w' }
    };

    const replay = replayGameRecord(record);

    expect(replay.ok).toBe(false);
    expect(replay.errors.length).toBeGreaterThan(0);
    expect(replay.errors[0].ply).toBe(1);
  });
});
