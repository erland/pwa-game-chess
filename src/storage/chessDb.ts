/**
 * Shared IndexedDB opener for the app.
 *
 * All modules that access IndexedDB must go through this file so that upgrade
 * logic is centralized. Otherwise, whichever module opens the DB first will
 * "win" the upgrade, and later modules cannot add their object stores.
 */

export const CHESS_DB_NAME = 'pwa-game-chess';
export const CHESS_DB_VERSION = 2;

export const STORE_GAMES = 'games';
export const STORE_TRAINING_ITEM_STATS = 'trainingItemStats';
export const STORE_TRAINING_DAILY_QUEUE = 'trainingDailyQueue';

export function hasIndexedDb(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as any).indexedDB !== 'undefined';
}

export function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

export async function openChessDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) throw new Error('IndexedDB not available');
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(CHESS_DB_NAME, CHESS_DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // ---- Finished games ----
      if (!db.objectStoreNames.contains(STORE_GAMES)) {
        const store = db.createObjectStore(STORE_GAMES, { keyPath: 'id' });
        store.createIndex('finishedAtMs', 'finishedAtMs', { unique: false });
      } else {
        // Ensure index exists (safe no-op if already created).
        const store = req.transaction?.objectStore(STORE_GAMES);
        if (store && !store.indexNames.contains('finishedAtMs')) {
          store.createIndex('finishedAtMs', 'finishedAtMs', { unique: false });
        }
      }

      // ---- Training item stats ----
      if (!db.objectStoreNames.contains(STORE_TRAINING_ITEM_STATS)) {
        const store = db.createObjectStore(STORE_TRAINING_ITEM_STATS, { keyPath: 'key' });
        store.createIndex('nextDueAtMs', 'nextDueAtMs', { unique: false });
        store.createIndex('lastSeenAtMs', 'lastSeenAtMs', { unique: false });
        store.createIndex('updatedAtMs', 'updatedAtMs', { unique: false });
      } else {
        const store = req.transaction?.objectStore(STORE_TRAINING_ITEM_STATS);
        if (store && !store.indexNames.contains('nextDueAtMs')) {
          store.createIndex('nextDueAtMs', 'nextDueAtMs', { unique: false });
        }
        if (store && !store.indexNames.contains('lastSeenAtMs')) {
          store.createIndex('lastSeenAtMs', 'lastSeenAtMs', { unique: false });
        }
        if (store && !store.indexNames.contains('updatedAtMs')) {
          store.createIndex('updatedAtMs', 'updatedAtMs', { unique: false });
        }
      }

      // ---- Daily queue snapshot ----
      if (!db.objectStoreNames.contains(STORE_TRAINING_DAILY_QUEUE)) {
        const store = db.createObjectStore(STORE_TRAINING_DAILY_QUEUE, { keyPath: 'date' });
        store.createIndex('generatedAtMs', 'generatedAtMs', { unique: false });
      } else {
        const store = req.transaction?.objectStore(STORE_TRAINING_DAILY_QUEUE);
        if (store && !store.indexNames.contains('generatedAtMs')) {
          store.createIndex('generatedAtMs', 'generatedAtMs', { unique: false });
        }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });

  return dbPromise;
}
