import {
  validateTrainingPack,
  validateTrainingPackIndex,
  type TrainingPack,
  type TrainingPackIndex,
  type TrainingPackIndexEntry
} from './schema';

export interface PackLoadError {
  packId?: string;
  file?: string;
  message: string;
}

export interface LoadBuiltInPacksResult {
  index?: TrainingPackIndex;
  packs: TrainingPack[];
  errors: PackLoadError[];
}

function getBaseUrl(): string {
  // Vite sets import.meta.env.BASE_URL, but Jest does not.
  const base = (import.meta as any)?.env?.BASE_URL;
  return typeof base === 'string' && base.length > 0 ? base : '/';
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}${p}`;
}

async function fetchJson(fetchFn: typeof fetch, url: string): Promise<unknown> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return await res.json();
}

/**
 * Loads built-in packs shipped from /public/training/packs/.
 *
 * NOTE: Uses import.meta.env.BASE_URL so it works on GitHub Pages with Vite's base path.
 */
export async function loadBuiltInPacks(
  fetchFn: typeof fetch = fetch,
  baseUrl: string = getBaseUrl()
): Promise<LoadBuiltInPacksResult> {
  const errors: PackLoadError[] = [];
  const packs: TrainingPack[] = [];

  const indexUrl = joinUrl(baseUrl, 'training/packs/index.json');
  let indexRaw: unknown;
  try {
    indexRaw = await fetchJson(fetchFn, indexUrl);
  } catch (e) {
    return { packs: [], errors: [{ message: `Failed to load pack index (${indexUrl}): ${(e as Error).message}` }] };
  }

  const indexV = validateTrainingPackIndex(indexRaw);
  if (!indexV.ok) {
    return { packs: [], errors: [{ message: `Invalid pack index: ${indexV.error}` }] };
  }

  const index: TrainingPackIndex = indexV.value;

  await Promise.all(
    index.packs.map(async (entry: TrainingPackIndexEntry) => {
      const url = joinUrl(baseUrl, `training/packs/${entry.file}`);
      try {
        const raw = await fetchJson(fetchFn, url);
        const val = validateTrainingPack(raw);
        if (!val.ok) {
          errors.push({ packId: entry.id, file: entry.file, message: `Invalid pack schema: ${val.error}` });
          return;
        }

        if (val.value.id !== entry.id) {
          errors.push({
            packId: entry.id,
            file: entry.file,
            message: `Pack id mismatch: index has "${entry.id}", pack has "${val.value.id}"`
          });
          // Still include the pack.
        }

        packs.push(val.value);
      } catch (e) {
        errors.push({ packId: entry.id, file: entry.file, message: `Failed to load pack: ${(e as Error).message}` });
      }
    })
  );

  packs.sort((a, b) => a.title.localeCompare(b.title));

  return { index, packs, errors };
}
