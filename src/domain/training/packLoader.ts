import {
  validateTrainingPack,
  validateTrainingPackIndex,
  type TrainingPack,
  type TrainingPackIndex,
  type TrainingPackIndexEntry
} from './schema';
import { listCustomPacks } from '../../storage/training/customPacksStore';

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

export interface LoadAllPacksResult extends LoadBuiltInPacksResult {
  /** Custom packs imported by the user. */
  customPacks: TrainingPack[];
}

// Cache built-in pack loading for the common runtime path (default fetch + inferred baseUrl).
// This avoids refetching/parsing the same public JSON files when navigating between training pages.
// NOTE: Tests pass a custom fetchFn, so caching is only enabled for the default `fetch`.
let builtInCache: { baseUrl: string; promise: Promise<LoadBuiltInPacksResult> } | null = null;

function getBaseUrl(): string {
  // Vite sets import.meta.env.BASE_URL (based on vite.config.ts `base`), but Jest does not.
  const viteBase = (import.meta as any)?.env?.BASE_URL;
  if (typeof viteBase === 'string' && viteBase.length > 0 && viteBase !== '/') return viteBase;

  // When running under a sub-path (e.g. http://localhost:5173/pwa-game-chess/),
  // fetch() calls must include that prefix. Infer it from window.location if possible.
  if (typeof window !== 'undefined') {
    const path = window.location?.pathname ?? '/';
    const seg = path.split('/').filter(Boolean)[0]; // first path segment
    if (seg) return `/${seg}/`;
  }

  return typeof viteBase === 'string' && viteBase.length > 0 ? viteBase : '/';
}


function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${b}${p}`;
}

async function fetchJson(fetchFn: any, url: string): Promise<unknown> {
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
  fetchFn: any = (globalThis as any).fetch,
  baseUrl: string = getBaseUrl(),
  options?: { force?: boolean }
): Promise<LoadBuiltInPacksResult> {
  const globalFetch: any = (globalThis as any).fetch;
  if (
    !options?.force &&
    typeof fetchFn === 'function' &&
    globalFetch &&
    fetchFn === globalFetch &&
    builtInCache &&
    builtInCache.baseUrl === baseUrl
  ) {
    return await builtInCache.promise;
  }

  const errors: PackLoadError[] = [];
  const packs: TrainingPack[] = [];

  const work = (async (): Promise<LoadBuiltInPacksResult> => {

    if (typeof fetchFn !== 'function') {
      return {
        packs: [],
        errors: [
          {
            message:
              'Failed to load pack index: fetchFn is not a function (provide a fetch implementation in this environment).'
          }
        ]
      };
    }

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
  })();

  if (!options?.force && typeof fetchFn === 'function' && globalFetch && fetchFn === globalFetch) {
    builtInCache = { baseUrl, promise: work };
  }

  return await work;
}


/**
 * Loads built-in packs plus any custom packs imported by the user.
 *
 * Custom packs override built-in packs with the same id.
 */
export async function loadAllPacks(
  fetchFn: any = (globalThis as any).fetch,
  baseUrl: string = getBaseUrl()
): Promise<LoadAllPacksResult> {
  const builtIn = await loadBuiltInPacks(fetchFn, baseUrl);
  const errors: PackLoadError[] = [...builtIn.errors];
  const custom = await listCustomPacks(500);

  const customPacks = custom.map((r) => r.pack);

  const byId = new Map<string, TrainingPack>();
  for (const p of builtIn.packs) byId.set(p.id, p);

  for (const p of customPacks) {
    if (byId.has(p.id)) {
      errors.push({ packId: p.id, message: 'Custom pack overrides a built-in pack with the same id.' });
    }
    byId.set(p.id, p);
  }

  const packs = Array.from(byId.values());
  packs.sort((a, b) => a.title.localeCompare(b.title));

  return { index: builtIn.index, packs, customPacks, errors };
}
