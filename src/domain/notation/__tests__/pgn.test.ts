import type { GameRecord } from '../../recording/types';
import { toPGN } from '../pgn';

describe('toPGN', () => {
  it('renders headers and SAN move text', () => {
    const record: GameRecord = {
      id: 'test1',
      mode: 'local',
      players: { white: 'Alice', black: 'Bob' },
      timeControl: { kind: 'none' },
      startedAtMs: Date.UTC(2020, 0, 2),
      finishedAtMs: Date.UTC(2020, 0, 2) + 1000,
      initialFen: null,
      moves: [
        { from: 12, to: 28 }, // e2->e4 (a1=0 indexing)
        { from: 52, to: 36 }, // e7->e5
        { from: 6, to: 21 } // g1->f3
      ],
      result: { result: '1-0', termination: 'resign', winner: 'w', loser: 'b' }
    };

    const pgn = toPGN(record);
    expect(pgn).toMatch(/\[White "Alice"\]/);
    expect(pgn).toMatch(/\[Black "Bob"\]/);
    expect(pgn).toMatch(/\[Result "1-0"\]/);
    expect(pgn).toMatch(/\n\n1\. e4 e5 2\. Nf3 1-0/);
  });
});
