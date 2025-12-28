import {
  hasIndexedDb,
  openChessDb,
  reqToPromise,
  txDone,
  STORE_TRAINING_OPENING_NODE_STATS
} from '../chessDb';

export type LastResult = 'success' | 'fail';

export interface OpeningNodeStats {
  /** Stable key: `${packId}:${itemId}#${plyIndex}` */
  key: string;
  packId: string;
  itemId: string;
  plyIndex: number;
  attempts: number;
  successes: number;
  lastSeenAtMs: number;
  lastResult: LastResult;
  streak: number;
  avgSolveMs: number;
  totalSolveMs: number;
  lastSolveMs: number;
  // Spaced repetition
  nextDueAtMs: number;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface RecordOpeningNodeAttemptInput {
  key: string;
  packId: string;
  itemId: string;
  plyIndex: number;
  success: boolean;
  solveMs: number;
  nowMs?: number;
}

const FALLBACK_KEY = 'pwa-game-chess.training.openingNodeStats.v1';
const DAY_MS = 24 * 60 * 60 * 1000;

function nowMs(v?: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : Date.now();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function readFallback(): Record<string, OpeningNodeStats> {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, OpeningNodeStats>;
  } catch {
    return {};
  }
}

function writeFallback(map: Record<string, OpeningNodeStats>): void {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

function defaultStats(input: RecordOpeningNodeAttemptInput, ts: number): OpeningNodeStats {
  return {
    key: input.key,
    packId: input.packId,
    itemId: input.itemId,
    plyIndex: input.plyIndex,
    attempts: 0,
    successes: 0,
    lastSeenAtMs: 0,
    lastResult: 'fail',
    streak: 0,
    avgSolveMs: 0,
    totalSolveMs: 0,
    lastSolveMs: 0,
    nextDueAtMs: 0,
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    createdAtMs: ts,
    updatedAtMs: ts
  };
}

function applyScheduling(prev: OpeningNodeStats, ok: boolean, ts: number): OpeningNodeStats {
  const next: OpeningNodeStats = { ...prev };

  if (ok) {
    next.streak = (next.streak || 0) + 1;
    next.reps = (next.reps || 0) + 1;
    next.ease = clamp((next.ease || 2.5) + 0.05, 1.3, 3.0);

    if (next.reps === 1) next.intervalDays = 1;
    else if (next.reps === 2) next.intervalDays = 3;
    else next.intervalDays = Math.max(1, Math.round((next.intervalDays || 3) * next.ease));

    next.nextDueAtMs = ts + next.intervalDays * DAY_MS;
  } else {
    next.streak = 0;
    next.lapses = (next.lapses || 0) + 1;
    next.reps = 0;
    next.ease = clamp((next.ease || 2.5) - 0.2, 1.3, 3.0);
    next.intervalDays = 1;
    next.nextDueAtMs = ts + next.intervalDays * DAY_MS;
  }

  return next;
}

async function openDb(): Promise<IDBDatabase> {
  return openChessDb();
}

export async function getOpeningNodeStats(key: string): Promise<OpeningNodeStats | null> {
  if (!hasIndexedDb()) {
    return readFallback()[key] ?? null;
  }
  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_OPENING_NODE_STATS, 'readonly');
  const store = tx.objectStore(STORE_TRAINING_OPENING_NODE_STATS);
  const res = await reqToPromise(store.get(key));
  await txDone(tx);
  return (res as OpeningNodeStats | undefined) ?? null;
}

export async function listOpeningNodeStats(): Promise<OpeningNodeStats[]> {
  if (!hasIndexedDb()) {
    return Object.values(readFallback()).sort((a, b) => (b.updatedAtMs - a.updatedAtMs) || a.key.localeCompare(b.key));
  }
  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_OPENING_NODE_STATS, 'readonly');
  const store = tx.objectStore(STORE_TRAINING_OPENING_NODE_STATS);
  const all = await reqToPromise(store.getAll());
  await txDone(tx);
  return (all as OpeningNodeStats[]).sort((a, b) => (b.updatedAtMs - a.updatedAtMs) || a.key.localeCompare(b.key));
}

export async function recordOpeningNodeAttempt(input: RecordOpeningNodeAttemptInput): Promise<OpeningNodeStats> {
  const ts = nowMs(input.nowMs);

  if (!hasIndexedDb()) {
    const map = readFallback();
    const existing = map[input.key];
    const base = existing ?? defaultStats(input, ts);

    const attempts = (base.attempts || 0) + 1;
    const successes = (base.successes || 0) + (input.success ? 1 : 0);
    const totalSolveMs = (base.totalSolveMs || 0) + Math.max(0, input.solveMs);
    const next: OpeningNodeStats = {
      ...base,
      packId: input.packId,
      itemId: input.itemId,
      plyIndex: input.plyIndex,
      attempts,
      successes,
      lastSeenAtMs: ts,
      lastResult: input.success ? 'success' : 'fail',
      totalSolveMs,
      lastSolveMs: Math.max(0, input.solveMs),
      avgSolveMs: attempts > 0 ? Math.round(totalSolveMs / attempts) : 0,
      updatedAtMs: ts
    };

    const scheduled = applyScheduling(next, input.success, ts);
    map[input.key] = scheduled;
    writeFallback(map);
    return scheduled;
  }

  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_OPENING_NODE_STATS, 'readwrite');
  const store = tx.objectStore(STORE_TRAINING_OPENING_NODE_STATS);

  const existing = (await reqToPromise(store.get(input.key))) as OpeningNodeStats | undefined;
  const base = existing ?? defaultStats(input, ts);

  const attempts = (base.attempts || 0) + 1;
  const successes = (base.successes || 0) + (input.success ? 1 : 0);
  const totalSolveMs = (base.totalSolveMs || 0) + Math.max(0, input.solveMs);

  const next: OpeningNodeStats = {
    ...base,
    packId: input.packId,
    itemId: input.itemId,
    plyIndex: input.plyIndex,
    attempts,
    successes,
    lastSeenAtMs: ts,
    lastResult: input.success ? 'success' : 'fail',
    totalSolveMs,
    lastSolveMs: Math.max(0, input.solveMs),
    avgSolveMs: attempts > 0 ? Math.round(totalSolveMs / attempts) : 0,
    updatedAtMs: ts
  };

  const scheduled = applyScheduling(next, input.success, ts);
  await reqToPromise(store.put(scheduled as any));
  await txDone(tx);
  return scheduled;
}

export async function clearOpeningNodeStore(): Promise<void> {
  if (!hasIndexedDb()) {
    writeFallback({});
    return;
  }
  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_OPENING_NODE_STATS, 'readwrite');
  const store = tx.objectStore(STORE_TRAINING_OPENING_NODE_STATS);
  await reqToPromise(store.clear());
  await txDone(tx);
}
