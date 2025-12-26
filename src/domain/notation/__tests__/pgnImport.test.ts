import { importPGNToGameRecord } from '../pgnImport';

describe('PGN import', () => {
  test('imports a simple PGN into a GameRecord', () => {
    const pgn = `
[Event "Test"]
[Site "Local"]
[Date "2025.12.25"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0
`.trim();

    const record = importPGNToGameRecord(pgn, { nowMs: 1234567890 });

    expect(record.players.white).toBe('Alice');
    expect(record.players.black).toBe('Bob');
    expect(record.mode).toBe('local');
    expect(record.moves).toHaveLength(6);
    expect(record.result.result).toBe('1-0');
    // Not checkmate/stalemate; default inference should mark it as resignation.
    expect(record.result.termination).toBe('resign');
  });

  test('accepts 0-0 castling notation and strips annotations', () => {
    const pgn = `
[Event "Test2"]
[Site "Local"]
[White "W"]
[Black "B"]
[Result "1/2-1/2"]

1. e4! e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. 0-0 Be7 1/2-1/2
`.trim();

    const record = importPGNToGameRecord(pgn, { nowMs: 5 });

    expect(record.moves.length).toBeGreaterThan(0);
    expect(record.result.result).toBe('1/2-1/2');
  });
});
