import type { GameRecord } from '../domain/recording/types';

/**
 * Minimal backend-free storage layer for finished games.
 *
 * Primary target is IndexedDB, but we provide a tiny localStorage fallback
 * so the app keeps working in test environments (jsdom) and older browsers.
 */

const DB_NAME = 'pwa-game-chess';
const DB_VERSION = 1;
const STORE = 'games';

const FALLBACK_KEY = 'pwa-game-chess.games.v1';

function hasIndexedDb(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as any).indexedDB !== 'undefined';
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

async function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) throw new Error('IndexedDB not available');
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('finishedAtMs', 'finishedAtMs', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
  return dbPromise;
}

// ---------- localStorage fallback ----------

function readFallback(): Record<string, GameRecord> {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, GameRecord>;
  } catch {
    return {};
  }
}

function writeFallback(map: Record<string, GameRecord>): void {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota and serialization issues; this is a best-effort fallback.
  }
}

// ---------- public API ----------

export async function putGame(record: GameRecord): Promise<void> {
  if (!hasIndexedDb()) {
    const map = readFallback();
    map[record.id] = record;
    writeFallback(map);
    return;
  }

  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  store.put(record);
  await txDone(tx);
}

export async function getGame(id: string): Promise<GameRecord | null> {
  if (!hasIndexedDb()) {
    const map = readFallback();
    return map[id] ?? null;
  }

  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const res = await reqToPromise(store.get(id));
  await txDone(tx);
  return (res as GameRecord | undefined) ?? null;
}

export async function deleteGame(id: string): Promise<void> {
  if (!hasIndexedDb()) {
    const map = readFallback();
    delete map[id];
    writeFallback(map);
    return;
  }

  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  store.delete(id);
  await txDone(tx);
}

export async function listGames(): Promise<GameRecord[]> {
  if (!hasIndexedDb()) {
    const map = readFallback();
    return Object.values(map).sort((a, b) => b.finishedAtMs - a.finishedAtMs);
  }

  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const all = await reqToPromise(store.getAll());
  await txDone(tx);
  return (all as GameRecord[]).sort((a, b) => b.finishedAtMs - a.finishedAtMs);
}
