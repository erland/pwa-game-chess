import type { GameRecord } from '../recording/types';
import type { Move } from '../chessTypes';
import { replayGameRecord } from '../review/replay';
import { toSAN } from './san';

function formatDate(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function timeControlTag(tc: GameRecord['timeControl']): string | null {
  if (tc.kind === 'none') return '-';
  // PGN TimeControl is commonly "initial+increment" in seconds.
  return `${tc.initialSeconds}+${tc.incrementSeconds}`;
}

function terminationLabel(term: GameRecord['result']['termination']): string {
  switch (term) {
    case 'checkmate': return 'Checkmate';
    case 'stalemate': return 'Stalemate';
    case 'drawInsufficientMaterial': return 'Insufficient material';
    case 'drawAgreement': return 'Draw agreement';
    case 'resign': return 'Resignation';
    case 'timeout': return 'Time forfeit';
  }
}

function wrapPgnMoves(text: string, width = 80): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line.length === 0) {
      line = w;
    } else if (line.length + 1 + w.length <= width) {
      line += ` ${w}`;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line.length) lines.push(line);
  return lines.join('\n');
}

export type PGNOptions = {
  /** Include a [FEN] tag if the record has initialFen. */
  includeInitialFenTag?: boolean;
};

/** Build a PGN string for a recorded game (SAN + headers). */
export function toPGN(record: GameRecord, options: PGNOptions = {}): string {
  const includeFen = options.includeInitialFenTag ?? true;

  const tags: Array<[string, string]> = [];
  tags.push(['Event', 'PWA Chess']);
  tags.push(['Site', record.mode === 'vsComputer' ? 'VsComputer' : 'Local']);
  tags.push(['Date', formatDate(record.startedAtMs)]);
  tags.push(['White', record.players.white]);
  tags.push(['Black', record.players.black]);
  tags.push(['Result', record.result.result]);
  tags.push(['Termination', terminationLabel(record.result.termination)]);
  const tc = timeControlTag(record.timeControl);
  if (tc) tags.push(['TimeControl', tc]);

  if (includeFen && record.initialFen) {
    tags.push(['SetUp', '1']);
    tags.push(['FEN', record.initialFen]);
  }

  const rep = replayGameRecord(record, { validateLegal: true, stopOnError: false });
  const frames = rep.frames;

  // Build SAN list from frames (ply 1..n)
  const sanMoves: string[] = [];
  for (let ply = 1; ply < frames.length; ply++) {
    const prev = frames[ply - 1].state;
    const mv = frames[ply].move as Move | undefined;
    if (!mv) break;
    sanMoves.push(toSAN(prev, mv));
  }

  // Format as numbered moves.
  let movesText = '';
  for (let i = 0; i < sanMoves.length; i += 2) {
    const moveNo = i / 2 + 1;
    const w = sanMoves[i];
    const b = sanMoves[i + 1];
    movesText += `${moveNo}. ${w}`;
    if (b) movesText += ` ${b}`;
    movesText += ' ';
  }
  movesText = movesText.trimEnd();

  // If replay detected errors, append a short comment (keeps output stable).
  if (!rep.ok && rep.errors.length) {
    const e = rep.errors[0];
    movesText += ` {Replay error at ply ${e.ply}: ${e.reason}}`;
  }

  movesText += ` ${record.result.result}`;

  const tagBlock = tags.map(([k, v]) => `[${k} "${v.replace(/"/g, '\\"')}"]`).join('\n');
  return `${tagBlock}\n\n${wrapPgnMoves(movesText)}\n`;
}
