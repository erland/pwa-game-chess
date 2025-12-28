import type { TrainingItemKey } from '../../domain/training/keys';
import {
  hasIndexedDb,
  openChessDb,
  reqToPromise,
  txDone,
  STORE_TRAINING_SESSIONS,
  STORE_TRAINING_SESSION_MISTAKES
} from '../chessDb';

export type TrainingMode = 'tactics' | 'openings' | 'endgames' | 'lessons' | 'daily';

export interface TrainingSessionRecord {
  id: string;
  mode: TrainingMode;
  startedAtMs: number;
  endedAtMs: number;
  attempted: number;
  correct: number;
  totalSolveMs: number;
  avgSolveMs: number;
  totalCpLoss: number;
  avgCpLoss: number;
  gradeCounts: Record<string, number>;
  packIds: string[];
}

export interface TrainingMistakeRecord {
  id: string;
  sessionId: string;
  itemKey: TrainingItemKey;
  packId: string;
  itemId: string;
  fen: string;
  expectedLineUci: string[];
  playedLineUci: string[];
  solveMs: number;
  createdAtMs: number;
  message?: string;
}

const FALLBACK_SESSIONS_KEY = 'pwa-game-chess.training.sessions.v1';
const FALLBACK_MISTAKES_KEY = 'pwa-game-chess.training.mistakes.v1';

function readFallback<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeFallback<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort
  }
}

export function makeSessionId(): string {
  const g: any = globalThis as any;
  const uuid = g?.crypto?.randomUUID ? g.crypto.randomUUID() : null;
  if (uuid) return uuid;
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeMistakeId(sessionId: string, itemKey: string, atMs: number): string {
  // deterministic-enough, but still unique across repeats.
  return `${sessionId}:${itemKey}:${atMs}:${Math.random().toString(36).slice(2, 8)}`;
}

async function openDb(): Promise<IDBDatabase> {
  return openChessDb();
}

// ---- sessions ----

export async function saveTrainingSession(session: TrainingSessionRecord): Promise<void> {
  if (!hasIndexedDb()) {
    const map = readFallback<Record<string, TrainingSessionRecord>>(FALLBACK_SESSIONS_KEY, {});
    map[session.id] = session;
    writeFallback(FALLBACK_SESSIONS_KEY, map);
    return;
  }

  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_SESSIONS, 'readwrite');
  tx.objectStore(STORE_TRAINING_SESSIONS).put(session);
  await txDone(tx);
}

export async function getTrainingSession(id: string): Promise<TrainingSessionRecord | null> {
  if (!hasIndexedDb()) {
    const map = readFallback<Record<string, TrainingSessionRecord>>(FALLBACK_SESSIONS_KEY, {});
    return map[id] ?? null;
  }
  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_SESSIONS, 'readonly');
  const res = await reqToPromise(tx.objectStore(STORE_TRAINING_SESSIONS).get(id));
  await txDone(tx);
  return (res as TrainingSessionRecord | undefined) ?? null;
}

export async function listTrainingSessions(limit = 20): Promise<TrainingSessionRecord[]> {
  if (!hasIndexedDb()) {
    const map = readFallback<Record<string, TrainingSessionRecord>>(FALLBACK_SESSIONS_KEY, {});
    return Object.values(map)
      .sort((a, b) => (b.endedAtMs - a.endedAtMs) || (b.startedAtMs - a.startedAtMs) || a.id.localeCompare(b.id))
      .slice(0, limit);
  }

  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_SESSIONS, 'readonly');
  const store = tx.objectStore(STORE_TRAINING_SESSIONS);
  const idx = store.index('endedAtMs');
  const out: TrainingSessionRecord[] = [];

  await new Promise<void>((resolve, reject) => {
    const req = idx.openCursor(null, 'prev');
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur || out.length >= limit) return resolve();
      out.push(cur.value as TrainingSessionRecord);
      cur.continue();
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to list sessions'));
  });

  await txDone(tx);
  return out;
}

// ---- mistakes ----

export async function addTrainingMistake(mistake: TrainingMistakeRecord): Promise<void> {
  if (!hasIndexedDb()) {
    const map = readFallback<Record<string, TrainingMistakeRecord>>(FALLBACK_MISTAKES_KEY, {});
    map[mistake.id] = mistake;
    writeFallback(FALLBACK_MISTAKES_KEY, map);
    return;
  }

  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_SESSION_MISTAKES, 'readwrite');
  tx.objectStore(STORE_TRAINING_SESSION_MISTAKES).put(mistake);
  await txDone(tx);
}

export async function listTrainingMistakes(sessionId: string): Promise<TrainingMistakeRecord[]> {
  if (!hasIndexedDb()) {
    const map = readFallback<Record<string, TrainingMistakeRecord>>(FALLBACK_MISTAKES_KEY, {});
    return Object.values(map)
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => (a.createdAtMs - b.createdAtMs) || a.id.localeCompare(b.id));
  }

  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_SESSION_MISTAKES, 'readonly');
  const store = tx.objectStore(STORE_TRAINING_SESSION_MISTAKES);
  const idx = store.index('sessionId');
  const out: TrainingMistakeRecord[] = [];

  await new Promise<void>((resolve, reject) => {
    const req = idx.openCursor(IDBKeyRange.only(sessionId));
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve();
      out.push(cur.value as TrainingMistakeRecord);
      cur.continue();
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to list mistakes'));
  });
  await txDone(tx);
  return out.sort((a, b) => (a.createdAtMs - b.createdAtMs) || a.id.localeCompare(b.id));
}

export async function clearTrainingSessions(): Promise<void> {
  if (!hasIndexedDb()) {
    writeFallback(FALLBACK_SESSIONS_KEY, {});
    writeFallback(FALLBACK_MISTAKES_KEY, {});
    return;
  }
  const db = await openDb();
  const tx = db.transaction([STORE_TRAINING_SESSIONS, STORE_TRAINING_SESSION_MISTAKES], 'readwrite');
  tx.objectStore(STORE_TRAINING_SESSIONS).clear();
  tx.objectStore(STORE_TRAINING_SESSION_MISTAKES).clear();
  await txDone(tx);
}
