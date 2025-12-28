import type { TrainingPack } from '../../domain/training/schema';
import { validateTrainingPack } from '../../domain/training/schema';
import { hasIndexedDb, openChessDb, reqToPromise, txDone, STORE_TRAINING_CUSTOM_PACKS } from '../chessDb';

export interface CustomPackRecord {
  id: string;
  pack: TrainingPack;
  addedAtMs: number;
  updatedAtMs: number;
}

const FALLBACK_KEY = 'pwa-game-chess:trainingCustomPacks:v1';

function readFallback(): Record<string, CustomPackRecord> {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, CustomPackRecord>;
  } catch {
    return {};
  }
}

function writeFallback(all: Record<string, CustomPackRecord>) {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export async function listCustomPacks(limit: number = 200): Promise<CustomPackRecord[]> {
  if (!hasIndexedDb()) {
    const all = Object.values(readFallback());
    all.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    return all.slice(0, limit);
  }

  const db = await openChessDb();
  const tx = db.transaction(STORE_TRAINING_CUSTOM_PACKS, 'readonly');
  const store = tx.objectStore(STORE_TRAINING_CUSTOM_PACKS);

  const req = store.getAll();
  const rows = (await reqToPromise<CustomPackRecord[]>(req)) ?? [];
  await txDone(tx);

  const out = rows
    .map((r) => {
      const v = validateTrainingPack((r as any).pack);
      if (!v.ok) return null;
      return { ...r, pack: v.value };
    })
    .filter(Boolean) as CustomPackRecord[];

  out.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  return out.slice(0, limit);
}

export async function getCustomPack(id: string): Promise<CustomPackRecord | null> {
  if (!hasIndexedDb()) {
    const all = readFallback();
    return all[id] ?? null;
  }

  const db = await openChessDb();
  const tx = db.transaction(STORE_TRAINING_CUSTOM_PACKS, 'readonly');
  const store = tx.objectStore(STORE_TRAINING_CUSTOM_PACKS);
  const row = (await reqToPromise<CustomPackRecord | undefined>(store.get(id))) ?? undefined;
  await txDone(tx);

  if (!row) return null;
  const v = validateTrainingPack((row as any).pack);
  if (!v.ok) return null;
  return { ...row, pack: v.value };
}

export async function upsertCustomPack(pack: TrainingPack, ts: number = Date.now()): Promise<CustomPackRecord> {
  const v = validateTrainingPack(pack);
  if (!v.ok) throw new Error(`Invalid pack schema: ${v.error}`);

  const id = v.value.id;

  if (!hasIndexedDb()) {
    const all = readFallback();
    const prev = all[id];
    const rec: CustomPackRecord = {
      id,
      pack: v.value,
      addedAtMs: prev?.addedAtMs ?? ts,
      updatedAtMs: ts
    };
    all[id] = rec;
    writeFallback(all);
    return rec;
  }

  const db = await openChessDb();
  const existing = await getCustomPack(id);
  const rec: CustomPackRecord = {
    id,
    pack: v.value,
    addedAtMs: existing?.addedAtMs ?? ts,
    updatedAtMs: ts
  };

  const tx = db.transaction(STORE_TRAINING_CUSTOM_PACKS, 'readwrite');
  tx.objectStore(STORE_TRAINING_CUSTOM_PACKS).put(rec);
  await txDone(tx);
  return rec;
}

export async function deleteCustomPack(id: string): Promise<void> {
  if (!hasIndexedDb()) {
    const all = readFallback();
    delete all[id];
    writeFallback(all);
    return;
  }

  const db = await openChessDb();
  const tx = db.transaction(STORE_TRAINING_CUSTOM_PACKS, 'readwrite');
  tx.objectStore(STORE_TRAINING_CUSTOM_PACKS).delete(id);
  await txDone(tx);
}

export async function exportCustomPacksBundle(): Promise<{ packs: TrainingPack[] }> {
  const rows = await listCustomPacks(1000);
  return { packs: rows.map((r) => r.pack) };
}

/**
 * Import either a single TrainingPack JSON or a bundle { packs: TrainingPack[] }.
 * Returns a count of imported packs.
 */
export async function importPacksJson(raw: unknown): Promise<number> {
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).packs)) {
    let n = 0;
    for (const p of (raw as any).packs as unknown[]) {
      const v = validateTrainingPack(p);
      if (!v.ok) throw new Error(`Invalid pack in bundle: ${v.error}`);
      await upsertCustomPack(v.value);
      n++;
    }
    return n;
  }

  const v = validateTrainingPack(raw);
  if (!v.ok) throw new Error(`Invalid pack schema: ${v.error}`);
  await upsertCustomPack(v.value);
  return 1;
}
