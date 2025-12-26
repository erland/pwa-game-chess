import type { GameRecord, GameResult, Players, TimeControl } from '../recording/types';
import type { Move } from '../chessTypes';
import { toMoveRecord } from '../recording/types';
import { createInitialGameState } from '../gameState';
import { generateLegalMoves } from '../legalMoves';
import { applyMove } from '../applyMove';
import { getGameStatus } from '../gameStatus';
import { toSAN } from './san';

export type PGNImportError =
  | { kind: 'parse'; message: string }
  | { kind: 'move'; ply: number; san: string; message: string };

export type PGNImportOptions = {
  /** Default mode for imported games when not inferable. */
  defaultMode?: GameRecord['mode'];
  /** Default player names when not specified in PGN tags. */
  defaultPlayers?: Players;
  /** Default time control when not specified in PGN tags. */
  defaultTimeControl?: TimeControl;
  /** Override timestamps (useful for tests). */
  nowMs?: number;
};

type ParsedPGN = {
  tags: Record<string, string>;
  moves: string[];
  resultToken: GameResult['result'] | null;
};

/** Remove {...} comments, ; line comments, and ( ... ) variations. */
function stripCommentsAndVariations(text: string): string {
  // Remove tag pairs first; caller handles.
  let s = text;

  // Remove brace comments (non-nested).
  s = s.replace(/\{[^}]*\}/g, ' ');

  // Remove ; to end-of-line comments
  s = s.replace(/;[^\n\r]*/g, ' ');

  // Remove variations: attempt to drop balanced (...) blocks.
  // We do a simple linear scan to be safe with nested parens.
  let out = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') {
      depth++;
      continue;
    }
    if (ch === ')') {
      if (depth > 0) depth--;
      continue;
    }
    if (depth === 0) out += ch;
  }
  return out;
}

function parseTagPairs(pgn: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const lines = pgn.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*\[([^\s]+)\s+\"([^\"]*)\"\]\s*$/);
    if (m) tags[m[1]] = m[2];
  }
  return tags;
}

function parseResultToken(tok: string): GameResult['result'] | null {
  if (tok === '1-0' || tok === '0-1' || tok === '1/2-1/2') return tok;
  return null;
}

function normalizeSanToken(tok: string): string {
  let t = tok.trim();
  // Some PGNs use 0-0 / 0-0-0
  t = t.replace(/^0-0-0$/i, 'O-O-O').replace(/^0-0$/i, 'O-O');

  // Strip NAGs like $1, $2 etc
  t = t.replace(/\$\d+/g, '');

  // Strip trailing annotations like !, ?, !!, ?!, etc.
  t = t.replace(/[!?]+/g, '');

  // Strip suffixes like "e.p." (rare)
  t = t.replace(/\s*e\.p\.?$/i, '');

  return t;
}

function tokenizeMovesSection(pgn: string): { moves: string[]; result: GameResult['result'] | null } {
  // Remove tag pair lines entirely.
  const body = pgn
    .split(/\r?\n/)
    .filter((l) => !/^\s*\[[^\]]+\]\s*$/.test(l))
    .join('\n');

  const cleaned = stripCommentsAndVariations(body);

  const tokens = cleaned
    .replace(/\r?\n/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const moves: string[] = [];
  let result: GameResult['result'] | null = null;

  for (const raw of tokens) {
    if (!raw) continue;

    // Skip move numbers: "1." or "34..." etc.
    if (/^\d+\.(\.\.)?$/.test(raw)) continue;
    if (/^\d+\.\.\.$/.test(raw)) continue;
    if (/^\d+\.$/.test(raw)) continue;
    if (/^\d+\.{3}$/.test(raw)) continue;

    // Some PGNs attach move number and move like "1.e4"
    const splitAttached = raw.match(/^(\d+)\.(.+)$/);
    if (splitAttached) {
      const rest = splitAttached[2];
      const maybeRes = parseResultToken(rest);
      if (maybeRes) { result = maybeRes; continue; }
      const n = normalizeSanToken(rest);
      if (n) moves.push(n);
      continue;
    }

    // Game termination marker
    const maybeResult = parseResultToken(raw);
    if (maybeResult) { result = maybeResult; continue; }

    // Ignore "..." token
    if (raw === '...') continue;

    moves.push(normalizeSanToken(raw));
  }

  return { moves, result };
}

function parseTimeControlTag(v: string | undefined): TimeControl | null {
  if (!v) return null;
  const s = v.trim();
  if (s === '-' || s.toLowerCase() === 'none') return { kind: 'none' };
  // common format: "600+0" or "300+5"
  const m = s.match(/^(\d+)\+(\d+)$/);
  if (m) {
    const initial = Number(m[1]);
    const inc = Number(m[2]);
    if (Number.isFinite(initial) && Number.isFinite(inc)) {
      return { kind: 'fischer', initialSeconds: initial, incrementSeconds: inc };
    }
  }
  return null;
}

function parseUTCDateTag(v: string | undefined, fallbackMs: number): number {
  if (!v) return fallbackMs;
  // PGN Date: YYYY.MM.DD or "????.??.??"
  const m = v.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return fallbackMs;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return fallbackMs;
  if (yyyy < 1000 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return fallbackMs;
  // Use UTC midnight.
  return Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0);
}

function inferModeFromTags(tags: Record<string, string>): GameRecord['mode'] | null {
  const site = (tags['Site'] ?? '').toLowerCase();
  if (site.includes('vscomputer') || site.includes('vs computer')) return 'vsComputer';
  if (site.includes('local')) return 'local';
  return null;
}

function buildResultFromFinalState(finalStatus: ReturnType<typeof getGameStatus>, pgnResult: GameResult['result'] | null, terminationTag?: string): GameResult {
  // Use computed terminal kinds when possible.
  switch (finalStatus.kind) {
    case 'checkmate':
      return { result: finalStatus.winner === 'w' ? '1-0' : '0-1', termination: 'checkmate' };
    case 'stalemate':
      return { result: '1/2-1/2', termination: 'stalemate' };
    case 'drawInsufficientMaterial':
      return { result: '1/2-1/2', termination: 'drawInsufficientMaterial' };
    case 'drawAgreement':
      return { result: '1/2-1/2', termination: 'drawAgreement' };
    case 'timeout': {
      // If a Termination tag indicates time, honor it, otherwise fall back.
      return { result: finalStatus.winner === 'w' ? '1-0' : '0-1', termination: 'timeout' };
    }
    case 'resign': {
      return { result: finalStatus.winner === 'w' ? '1-0' : '0-1', termination: 'resign' };
    }
    case 'inProgress':
      break;
  }

  // If we didn't detect a terminal state, infer from tags/result.
  const termText = (terminationTag ?? '').toLowerCase();
  if (termText.includes('time')) {
    // We don't know winner; use pgnResult if present.
    return { result: pgnResult ?? '1/2-1/2', termination: 'timeout' };
  }

  if (pgnResult === '1/2-1/2') return { result: '1/2-1/2', termination: 'drawAgreement' };
  if (pgnResult === '1-0' || pgnResult === '0-1') return { result: pgnResult, termination: 'resign' };

  // Default safe outcome.
  return { result: '1/2-1/2', termination: 'drawAgreement' };
}

function parsePGN(pgn: string): ParsedPGN {
  const tags = parseTagPairs(pgn);
  const { moves, result } = tokenizeMovesSection(pgn);
  return { tags, moves, resultToken: result };
}

/**
 * Import a PGN into a GameRecord by replaying SAN moves deterministically from the initial position.
 * Throws on parse/move errors.
 */
export function importPGNToGameRecord(pgnText: string, options: PGNImportOptions = {}): GameRecord {
  const nowMs = options.nowMs ?? Date.now();

  const parsed = parsePGN(pgnText);
  const tags = parsed.tags;

  const mode = inferModeFromTags(tags) ?? options.defaultMode ?? 'local';
  const players: Players = {
    white: tags['White'] ?? options.defaultPlayers?.white ?? 'White',
    black: tags['Black'] ?? options.defaultPlayers?.black ?? 'Black'
  };

  const timeControl = parseTimeControlTag(tags['TimeControl']) ?? options.defaultTimeControl ?? { kind: 'none' };

  const startedAtMs = parseUTCDateTag(tags['Date'], nowMs);
  // We don't have a time-of-day; approximate end time as start + N seconds.
  const finishedAtMs = startedAtMs + Math.max(1, parsed.moves.length) * 1000;

  const id = `pgn_${nowMs}_${Math.random().toString(16).slice(2)}`;

  let state = createInitialGameState();
  const moveRecords: GameRecord['moves'] = [];

  for (let ply = 0; ply < parsed.moves.length; ply++) {
    const sanTok = parsed.moves[ply];
    const wanted = normalizeSanToken(sanTok);

    const legal = generateLegalMoves(state);

    // Build candidate SAN map (normalized).
    let chosen: { move: Move; san: string } | null = null;
    for (const mv of legal) {
      const san = toSAN(state, mv);
      if (normalizeSanToken(san) === wanted) {
        chosen = { move: mv, san };
        break;
      }
    }

    if (!chosen) {
      // Try a slightly looser match: ignore trailing +/# if token omitted it (rare).
      const wantedLoose = wanted.replace(/[+#]$/g, '');
      for (const mv of legal) {
        const san = toSAN(state, mv);
        const ns = normalizeSanToken(san).replace(/[+#]$/g, '');
        if (ns === wantedLoose) {
          chosen = { move: mv, san };
          break;
        }
      }
    }

    if (!chosen) {
      throw new Error(`PGN import: could not match move at ply ${ply + 1}: "${sanTok}"`);
    }

    moveRecords.push(toMoveRecord(chosen.move));
    state = applyMove(state, chosen.move);
  }

  const finalStatus = getGameStatus(state);

  const result = buildResultFromFinalState(finalStatus, parsed.resultToken, tags['Termination']);

  return {
    id,
    mode,
    players,
    timeControl,
    startedAtMs,
    finishedAtMs,
    initialFen: tags['FEN'] ? tags['FEN'] : null,
    moves: moveRecords,
    result
  };
}
