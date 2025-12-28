import type { Color, GameState } from '../chessTypes';
import { toFEN, tryParseFEN } from '../notation/fen';
import { applyForcedUciMove, normalizeUci } from './openingsDrill';

export interface OpeningNodeRef {
  /** `${packId}:${itemId}#${plyIndex}` */
  key: string;
  packId: string;
  itemId: string;
  packTitle: string;
  name: string;
  /** Index into the lineUci array for the expected user move */
  plyIndex: number;
  /** FEN before the expected move */
  fen: string;
  expectedUci: string;
  lineUci: string[];
}

export interface BuildOpeningNodesInput {
  packId: string;
  packTitle: string;
  itemId: string;
  name: string;
  startFen: string;
  lineUci: string[];
  userColor: Color;
}

export type BuildOpeningNodesResult = { nodes: OpeningNodeRef[]; warnings: string[] };

export function buildOpeningNodes(input: BuildOpeningNodesInput): BuildOpeningNodesResult {
  const warnings: string[] = [];
  const nodes: OpeningNodeRef[] = [];

  const parsed = tryParseFEN(input.startFen);
  if (!parsed.ok) {
    return { nodes: [], warnings: [`Invalid FEN for opening line ${input.packId}:${input.itemId}: ${parsed.error}`] };
  }

  let state: GameState = parsed.value;

  for (let i = 0; i < input.lineUci.length; i += 1) {
    const expected = normalizeUci(input.lineUci[i]);

    if (state.sideToMove === input.userColor) {
      const fen = toFEN(state);
      nodes.push({
        key: `${input.packId}:${input.itemId}#${i}`,
        packId: input.packId,
        itemId: input.itemId,
        packTitle: input.packTitle,
        name: input.name,
        plyIndex: i,
        fen,
        expectedUci: expected,
        lineUci: input.lineUci.map(normalizeUci)
      });
    }

    const r = applyForcedUciMove(state, expected);
    if (!r.ok) {
      warnings.push(`Opening line ${input.packId}:${input.itemId} is invalid at ply ${i}: ${r.error}`);
      break;
    }
    state = r.state;
  }

  return { nodes, warnings };
}

export interface OpeningNodeStatsLike {
  key: string;
  attempts: number;
  lastSeenAtMs: number;
  nextDueAtMs: number;
}

/**
 * Deterministically pick the next opening node to drill.
 * Prefers due nodes, then unseen nodes, then least-recently-seen.
 */
export function pickNextOpeningNode(
  nodes: OpeningNodeRef[],
  stats: OpeningNodeStatsLike[],
  ts: number,
  focusKey?: string | null
): OpeningNodeRef | null {
  if (nodes.length === 0) return null;

  if (focusKey) {
    const f = nodes.find((n) => n.key === focusKey);
    if (f) return f;
  }

  const byKey = new Map<string, OpeningNodeStatsLike>();
  for (const s of stats) byKey.set(s.key, s);

  const due: OpeningNodeRef[] = [];
  const fresh: OpeningNodeRef[] = [];
  const seen: OpeningNodeRef[] = [];

  for (const n of nodes) {
    const s = byKey.get(n.key);
    if (!s || (s.attempts || 0) === 0) fresh.push(n);
    else if ((s.nextDueAtMs || 0) <= ts) due.push(n);
    else seen.push(n);
  }

  const byKeyAsc = (a: OpeningNodeRef, b: OpeningNodeRef) => a.key.localeCompare(b.key);
  due.sort(byKeyAsc);
  fresh.sort(byKeyAsc);
  seen.sort((a, b) => {
    const sa = byKey.get(a.key)?.lastSeenAtMs || 0;
    const sb = byKey.get(b.key)?.lastSeenAtMs || 0;
    if (sa !== sb) return sa - sb;
    return a.key.localeCompare(b.key);
  });

  return due[0] ?? fresh[0] ?? seen[0] ?? null;
}
