import type { GameRecord } from '../domain/recording/types';
import { hasIndexedDb, openChessDb, reqToPromise, txDone, STORE_GAMES } from './chessDb';

/**
 * Minimal backend-free storage layer for finished games.
 *
 * Primary target is IndexedDB, but we provide a tiny localStorage fallback
 * so the app keeps working in test environments (jsdom) and older browsers.
 */

const FALLBACK_KEY = 'pwa-game-chess.games.v1';

async function openDb(): Promise<IDBDatabase> {
  return openChessDb();
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
  const tx = db.transaction(STORE_GAMES, 'readwrite');
  const store = tx.objectStore(STORE_GAMES);
  store.put(record);
  await txDone(tx);
}

export async function getGame(id: string): Promise<GameRecord | null> {
  if (!hasIndexedDb()) {
    const map = readFallback();
    return map[id] ?? null;
  }

  const db = await openDb();
  const tx = db.transaction(STORE_GAMES, 'readonly');
  const store = tx.objectStore(STORE_GAMES);
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
  const tx = db.transaction(STORE_GAMES, 'readwrite');
  const store = tx.objectStore(STORE_GAMES);
  store.delete(id);
  await txDone(tx);
}

export async function listGames(): Promise<GameRecord[]> {
  if (!hasIndexedDb()) {
    const map = readFallback();
    return Object.values(map).sort((a, b) => b.finishedAtMs - a.finishedAtMs);
  }

  const db = await openDb();
  const tx = db.transaction(STORE_GAMES, 'readonly');
  const store = tx.objectStore(STORE_GAMES);
  const all = await reqToPromise(store.getAll());
  await txDone(tx);
  return (all as GameRecord[]).sort((a, b) => b.finishedAtMs - a.finishedAtMs);
}
