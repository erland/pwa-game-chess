import type { TrainingItemKey } from '../../domain/training/keys';
import { splitItemKey } from '../../domain/training/keys';
import {
  hasIndexedDb,
  openChessDb,
  reqToPromise,
  txDone,
  STORE_TRAINING_LESSON_PROGRESS
} from '../chessDb';

export interface LessonProgressRecord {
  /** packId:itemId */
  key: TrainingItemKey;
  packId: string;
  itemId: string;
  /** Index of the next block to show. */
  currentBlockIndex: number;
  /** Timestamp when the user last advanced or saved progress. */
  updatedAtMs: number;
  /** If set, the lesson is complete. */
  completedAtMs?: number;
}

const FALLBACK_KEY = 'pwa-game-chess.training.lessonProgress.v1';

function readFallbackMap(): Record<string, LessonProgressRecord> {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, LessonProgressRecord>;
  } catch {
    return {};
  }
}

function writeFallbackMap(map: Record<string, LessonProgressRecord>): void {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

async function openDb(): Promise<IDBDatabase> {
  return openChessDb();
}

export async function getLessonProgress(key: TrainingItemKey): Promise<LessonProgressRecord | null> {
  if (!hasIndexedDb()) {
    const map = readFallbackMap();
    return map[key] ?? null;
  }

  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_LESSON_PROGRESS, 'readonly');
  const res = await reqToPromise(tx.objectStore(STORE_TRAINING_LESSON_PROGRESS).get(key));
  await txDone(tx);
  return (res as LessonProgressRecord | undefined) ?? null;
}

export async function saveLessonProgress(key: TrainingItemKey, currentBlockIndex: number, opts?: { completed?: boolean }): Promise<LessonProgressRecord> {
  const parts = splitItemKey(key);
  if (!parts) throw new Error(`Invalid lesson key: ${key}`);

  const now = Date.now();
  const existing = await getLessonProgress(key);
  const record: LessonProgressRecord = {
    key,
    packId: parts.packId,
    itemId: parts.itemId,
    currentBlockIndex,
    updatedAtMs: now,
    completedAtMs: opts?.completed ? (existing?.completedAtMs ?? now) : existing?.completedAtMs
  };

  if (!hasIndexedDb()) {
    const map = readFallbackMap();
    map[key] = record;
    writeFallbackMap(map);
    return record;
  }

  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_LESSON_PROGRESS, 'readwrite');
  tx.objectStore(STORE_TRAINING_LESSON_PROGRESS).put(record);
  await txDone(tx);
  return record;
}

export async function clearLessonProgress(key: TrainingItemKey): Promise<void> {
  if (!hasIndexedDb()) {
    const map = readFallbackMap();
    delete map[key];
    writeFallbackMap(map);
    return;
  }
  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_LESSON_PROGRESS, 'readwrite');
  tx.objectStore(STORE_TRAINING_LESSON_PROGRESS).delete(key);
  await txDone(tx);
}

export async function listLessonProgress(limit = 200): Promise<LessonProgressRecord[]> {
  if (!hasIndexedDb()) {
    const map = readFallbackMap();
    return Object.values(map)
      .sort((a, b) => (b.updatedAtMs - a.updatedAtMs) || a.key.localeCompare(b.key))
      .slice(0, limit);
  }

  const db = await openDb();
  const tx = db.transaction(STORE_TRAINING_LESSON_PROGRESS, 'readonly');
  const store = tx.objectStore(STORE_TRAINING_LESSON_PROGRESS);
  const idx = store.index('updatedAtMs');
  const out: LessonProgressRecord[] = [];

  // Read newest first.
  let cursor = idx.openCursor(null, 'prev');
  await new Promise<void>((resolve, reject) => {
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return resolve();
      out.push(c.value as LessonProgressRecord);
      if (out.length >= limit) return resolve();
      c.continue();
    };
    cursor.onerror = () => reject(cursor.error ?? new Error('Failed to read lesson progress'));
  });

  await txDone(tx);
  return out;
}
