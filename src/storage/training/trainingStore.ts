import type { TrainingPack } from '../../domain/training/schema';
import type { TrainingItemKey } from '../../domain/training/keys';
import { makeItemKey } from '../../domain/training/keys';
import {
  hasIndexedDb,
  openChessDb,
  reqToPromise,
  txDone,
  STORE_TRAINING_DAILY_QUEUE,
  STORE_TRAINING_ITEM_STATS
} from '../chessDb';

export type LastResult = 'success' | 'fail';

export interface TrainingItemStats {
  key: TrainingItemKey;
  packId: string;
  itemId: string;
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

export interface TrainingDailyQueue {
  date: string; // YYYY-MM-DD
  generatedAtMs: number;
  itemKeys: TrainingItemKey[];
}

export interface DailyQueueOptions {
  maxItems?: number; // default 10
  maxNew?: number; // default 3
}

const FALLBACK_STATS_KEY = 'pwa-game-chess.training.itemStats.v1';
const FALLBACK_QUEUE_KEY = 'pwa-game-chess.training.dailyQueue.v1';

const DAY_MS = 24 * 60 * 60 * 1000;

function nowMs(v?: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : Date.now();
}

function isIsoDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function readStatsFallback(): Record<string, TrainingItemStats> {
  try {
    const raw = localStorage.getItem(FALLBACK_STATS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, TrainingItemStats>;
  } catch {
    return {};
  }
}

function writeStatsFallback(map: Record<string, TrainingItemStats>): void {
  try {
    localStorage.setItem(FALLBACK_STATS_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

function readQueueFallback(): Record<string, TrainingDailyQueue> {
  try {
    const raw = localStorage.getItem(FALLBACK_QUEUE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, TrainingDailyQueue>;
  } catch {
    return {};
  }
}

function writeQueueFallback(map: Record<string, TrainingDailyQueue>): void {
  try {
    localStorage.setItem(FALLBACK_QUEUE_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

async function openDb(): Promise<IDBDatabase> {
  return openChessDb();
}

function defaultStats(key: TrainingItemKey, packId: string, itemId: string, ts: number): TrainingItemStats {
  return {
    key,
    packId,
    itemId,
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

function applyScheduling(prev: TrainingItemStats, ok: boolean, ts: number): TrainingItemStats {
  const next: TrainingItemStats = { ...prev };

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

// ---------- public API: item stats ----------

export async function getItemStats(key: TrainingItemKey): Promise<TrainingItemStats | null> {
  if (!hasIndexedDb()) {
    const map = readStatsFallback();
    return map[key] ?? null;
  }

  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_ITEM_STATS, 'readonly');
  const store = tx.objectStore(STORE_TRAINING_ITEM_STATS);
  const res = await reqToPromise(store.get(key));
  await txDone(tx);
  return (res as TrainingItemStats | undefined) ?? null;
}

export async function listItemStats(): Promise<TrainingItemStats[]> {
  if (!hasIndexedDb()) {
    return Object.values(readStatsFallback()).sort((a, b) => (b.updatedAtMs - a.updatedAtMs) || a.key.localeCompare(b.key));
  }

  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_ITEM_STATS, 'readonly');
  const store = tx.objectStore(STORE_TRAINING_ITEM_STATS);
  const all = await reqToPromise(store.getAll());
  await txDone(tx);
  return (all as TrainingItemStats[]).sort((a, b) => (b.updatedAtMs - a.updatedAtMs) || a.key.localeCompare(b.key));
}

export interface RecordAttemptInput {
  packId: string;
  itemId: string;
  success: boolean;
  solveMs: number;
  nowMs?: number;
}

export async function recordAttempt(input: RecordAttemptInput): Promise<TrainingItemStats> {
  const ts = nowMs(input.nowMs);
  const key = makeItemKey(input.packId, input.itemId);

  const existing = await getItemStats(key);
  const base = existing ?? defaultStats(key, input.packId, input.itemId, ts);

  let next: TrainingItemStats = {
    ...base,
    attempts: (base.attempts || 0) + 1,
    successes: (base.successes || 0) + (input.success ? 1 : 0),
    lastSeenAtMs: ts,
    lastResult: input.success ? 'success' : 'fail',
    lastSolveMs: Math.max(0, Math.round(input.solveMs || 0)),
    totalSolveMs: (base.totalSolveMs || 0) + Math.max(0, Math.round(input.solveMs || 0)),
    createdAtMs: base.createdAtMs || ts,
    updatedAtMs: ts
  };

  next.avgSolveMs = next.attempts > 0 ? Math.round(next.totalSolveMs / next.attempts) : 0;
  next = applyScheduling(next, input.success, ts);

  if (!hasIndexedDb()) {
    const map = readStatsFallback();
    map[key] = next;
    writeStatsFallback(map);
    return next;
  }

  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_ITEM_STATS, 'readwrite');
  const store = tx.objectStore(STORE_TRAINING_ITEM_STATS);
  store.put(next);
  await txDone(tx);
  return next;
}

// ---------- public API: daily queue ----------

export async function getDailyQueue(date: string): Promise<TrainingDailyQueue | null> {
  if (!isIsoDate(date)) throw new Error(`Invalid date: ${date}`);
  if (!hasIndexedDb()) {
    const map = readQueueFallback();
    return map[date] ?? null;
  }

  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_DAILY_QUEUE, 'readonly');
  const store = tx.objectStore(STORE_TRAINING_DAILY_QUEUE);
  const res = await reqToPromise(store.get(date));
  await txDone(tx);
  return (res as TrainingDailyQueue | undefined) ?? null;
}

function allItemKeys(packs: TrainingPack[]): TrainingItemKey[] {
  const keys: TrainingItemKey[] = [];
  for (const p of packs) {
    for (const it of p.items) keys.push(makeItemKey(p.id, it.itemId));
  }
  keys.sort((a, b) => a.localeCompare(b));
  return keys;
}

export function buildDailyQueueItems(
  packs: TrainingPack[],
  stats: TrainingItemStats[],
  ts: number,
  options?: DailyQueueOptions
): TrainingItemKey[] {
  const maxItems = options?.maxItems ?? 10;
  const maxNew = options?.maxNew ?? 3;

  const statsByKey = new Map<string, TrainingItemStats>();
  for (const s of stats) statsByKey.set(s.key, s);

  const keys = allItemKeys(packs);

  const due: TrainingItemKey[] = [];
  const fresh: TrainingItemKey[] = [];

  for (const k of keys) {
    const s = statsByKey.get(k);
    if (s && s.attempts > 0) {
      if ((s.nextDueAtMs || 0) <= ts) due.push(k);
    } else {
      fresh.push(k);
    }
  }

  due.sort((a, b) => {
    const sa = statsByKey.get(a)?.nextDueAtMs ?? 0;
    const sb = statsByKey.get(b)?.nextDueAtMs ?? 0;
    return (sa - sb) || a.localeCompare(b);
  });

  const out: TrainingItemKey[] = [];
  for (const k of due) {
    if (out.length >= maxItems) break;
    out.push(k);
  }

  // Prefer a small number of "new" items, but if we don't have enough due
  // items, fill up deterministically with more new items.
  let remaining = maxItems - out.length;
  const firstNewCount = Math.min(maxNew, remaining);
  for (let i = 0; i < firstNewCount; i++) out.push(fresh[i]);
  remaining = maxItems - out.length;
  for (let i = firstNewCount; i < fresh.length && remaining > 0; i++, remaining--) {
    out.push(fresh[i]);
  }

  return out;
}

export async function ensureDailyQueue(
  packs: TrainingPack[],
  date: string,
  options?: DailyQueueOptions,
  nowOverrideMs?: number
): Promise<TrainingDailyQueue> {
  if (!isIsoDate(date)) throw new Error(`Invalid date: ${date}`);

  const existing = await getDailyQueue(date);
  if (existing) return existing;

  const ts = nowMs(nowOverrideMs);
  const stats = await listItemStats();
  const itemKeys = buildDailyQueueItems(packs, stats, ts, options);
  const queue: TrainingDailyQueue = { date, generatedAtMs: ts, itemKeys };

  if (!hasIndexedDb()) {
    const map = readQueueFallback();
    map[date] = queue;
    writeQueueFallback(map);
    return queue;
  }

  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_DAILY_QUEUE, 'readwrite');
  const store = tx.objectStore(STORE_TRAINING_DAILY_QUEUE);
  store.put(queue);
  await txDone(tx);
  return queue;
}

// ---------- utilities (tests / debug) ----------

export async function clearTrainingStore(): Promise<void> {
  try {
    localStorage.removeItem(FALLBACK_STATS_KEY);
    localStorage.removeItem(FALLBACK_QUEUE_KEY);
  } catch {
    // ignore
  }

  if (!hasIndexedDb()) return;
  const db = await openDb();
  const tx = db.transaction([STORE_TRAINING_ITEM_STATS, STORE_TRAINING_DAILY_QUEUE], 'readwrite');
  tx.objectStore(STORE_TRAINING_ITEM_STATS).clear();
  tx.objectStore(STORE_TRAINING_DAILY_QUEUE).clear();
  await txDone(tx);
}
