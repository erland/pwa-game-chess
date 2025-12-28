export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type TrainingItemType = 'tactic' | 'openingLine' | 'endgame' | 'lesson';

export interface TrainingPackIndexEntry {
  id: string;
  title: string;
  file: string; // relative to public/training/packs/
  description?: string;
  tags?: string[];
}

export interface TrainingPackIndex {
  packs: TrainingPackIndexEntry[];
}

export interface TrainingPosition {
  fen: string;
}

export interface TrainingItemBase {
  type: TrainingItemType;
  itemId: string;
  difficulty: number; // 1..5 (soft-validated)
  themes: string[];
  source?: string;
  notes?: string;
  position: TrainingPosition;
}

export interface TacticSolution {
  /**
   * Single-move solution (v1 packs).
   *
   * Prefer using lineUci for new packs.
   */
  uci?: string;
  san?: string;

  /**
   * Multi-move solution line (v2 packs).
   *
   * Includes both the player's moves and the expected opponent replies,
   * starting from the side-to-move in the item's FEN.
   */
  lineUci?: string[];
}

export interface TacticItem extends TrainingItemBase {
  type: 'tactic';
  goal?: string;
  solutions: TacticSolution[];
}

export interface OpeningLineItem extends TrainingItemBase {
  type: 'openingLine';
  name?: string;
  line: string[]; // SAN or UCI (future)
}

export interface EndgameItem extends TrainingItemBase {
  type: 'endgame';
  goal?: string;
}

export type LessonBlock =
  | { kind: 'markdown'; markdown: string }
  | { kind: 'diagram'; fen: string; caption?: string; orientation?: 'w' | 'b' }
  | {
      kind: 'tryMove';
      /** Starting position for this prompt. */
      fen: string;
      /** Prompt shown to the user. */
      prompt: string;
      /** Acceptable moves to continue. */
      expectedUci: string | string[];
      /** Optional hint text shown when the user asks for a hint (or plays a wrong move, depending on wrongBehavior). */
      hintMarkdown?: string;
      /** What to do if the move is wrong (default: 'hint'). */
      wrongBehavior?: 'hint' | 'rewind' | 'reveal';
    };

export interface LessonItem extends TrainingItemBase {
  type: 'lesson';
  title?: string;
  /** Simple lesson body (legacy). Prefer blocks for new content. */
  markdown?: string;
  /** Structured blocks for interactive lessons. */
  blocks?: LessonBlock[];
}

export type TrainingItem = TacticItem | OpeningLineItem | EndgameItem | LessonItem;

export interface TrainingPack {
  id: string;
  title: string;
  version: number;
  author: string;
  license: string;
  tags: string[];
  items: TrainingItem[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function at(path: string, msg: string) {
  return path ? `${path}: ${msg}` : msg;
}

function requireString(obj: Record<string, unknown>, key: string, path: string): ValidationResult<string> {
  const v = obj[key];
  if (typeof v === 'string' && v.trim().length > 0) return { ok: true, value: v };
  return { ok: false, error: at(path ? `${path}.${key}` : key, 'must be a non-empty string') };
}

function requireNumber(obj: Record<string, unknown>, key: string, path: string): ValidationResult<number> {
  const v = obj[key];
  if (typeof v === 'number' && Number.isFinite(v)) return { ok: true, value: v };
  return { ok: false, error: at(path ? `${path}.${key}` : key, 'must be a finite number') };
}

function optionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function optionalStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const v = obj[key];
  if (!Array.isArray(v)) return undefined;
  if (!v.every((x) => typeof x === 'string')) return undefined;
  return v as string[];
}

function requireStringArray(obj: Record<string, unknown>, key: string, path: string): ValidationResult<string[]> {
  const v = obj[key];
  if (!Array.isArray(v)) return { ok: false, error: at(path ? `${path}.${key}` : key, 'must be an array of strings') };
  if (!v.every((x) => typeof x === 'string')) {
    return { ok: false, error: at(path ? `${path}.${key}` : key, 'must be an array of strings') };
  }
  return { ok: true, value: v as string[] };
}

function requireRecord(obj: Record<string, unknown>, key: string, path: string): ValidationResult<Record<string, unknown>> {
  const v = obj[key];
  if (isRecord(v)) return { ok: true, value: v };
  return { ok: false, error: at(path ? `${path}.${key}` : key, 'must be an object') };
}

export function validateTrainingPackIndex(raw: unknown): ValidationResult<TrainingPackIndex> {
  if (!isRecord(raw)) return { ok: false, error: 'index: must be an object' };
  const packsVal = raw['packs'];
  if (!Array.isArray(packsVal)) return { ok: false, error: 'index.packs: must be an array' };

  const packs: TrainingPackIndexEntry[] = [];
  for (let i = 0; i < packsVal.length; i++) {
    const entry = packsVal[i];
    const path = `index.packs[${i}]`;
    if (!isRecord(entry)) return { ok: false, error: at(path, 'must be an object') };

    const idR = requireString(entry, 'id', path);
    if (!idR.ok) return idR;
    const titleR = requireString(entry, 'title', path);
    if (!titleR.ok) return titleR;
    const fileR = requireString(entry, 'file', path);
    if (!fileR.ok) return fileR;

    const description = optionalString(entry, 'description');
    const tags = optionalStringArray(entry, 'tags');

    packs.push({ id: idR.value, title: titleR.value, file: fileR.value, description, tags });
  }

  return { ok: true, value: { packs } };
}

export function validateTrainingPack(raw: unknown): ValidationResult<TrainingPack> {
  if (!isRecord(raw)) return { ok: false, error: 'pack: must be an object' };

  const idR = requireString(raw, 'id', 'pack');
  if (!idR.ok) return idR;
  const titleR = requireString(raw, 'title', 'pack');
  if (!titleR.ok) return titleR;
  const versionR = requireNumber(raw, 'version', 'pack');
  if (!versionR.ok) return versionR;
  const authorR = requireString(raw, 'author', 'pack');
  if (!authorR.ok) return authorR;
  const licenseR = requireString(raw, 'license', 'pack');
  if (!licenseR.ok) return licenseR;
  const tagsR = requireStringArray(raw, 'tags', 'pack');
  if (!tagsR.ok) return tagsR;

  const itemsVal = raw['items'];
  if (!Array.isArray(itemsVal)) return { ok: false, error: 'pack.items: must be an array' };

  const items: TrainingItem[] = [];
  for (let i = 0; i < itemsVal.length; i++) {
    const item = itemsVal[i];
    const path = `pack.items[${i}]`;
    if (!isRecord(item)) return { ok: false, error: at(path, 'must be an object') };

    const type = item['type'];
    if (type !== 'tactic' && type !== 'openingLine' && type !== 'endgame' && type !== 'lesson') {
      return { ok: false, error: at(`${path}.type`, 'must be one of: tactic, openingLine, endgame, lesson') };
    }

    const itemIdR = requireString(item, 'itemId', path);
    if (!itemIdR.ok) return itemIdR;
    const difficultyR = requireNumber(item, 'difficulty', path);
    if (!difficultyR.ok) return difficultyR;
    const themesR = requireStringArray(item, 'themes', path);
    if (!themesR.ok) return themesR;

    const positionR = requireRecord(item, 'position', path);
    if (!positionR.ok) return positionR;
    const fenR = requireString(positionR.value, 'fen', `${path}.position`);
    if (!fenR.ok) return fenR;

    const common: TrainingItemBase = {
      type,
      itemId: itemIdR.value,
      difficulty: difficultyR.value,
      themes: themesR.value,
      source: optionalString(item, 'source'),
      notes: optionalString(item, 'notes'),
      position: { fen: fenR.value }
    };

    if (type === 'tactic') {
      const solsVal = item['solutions'];
      if (!Array.isArray(solsVal) || solsVal.length === 0) {
        return { ok: false, error: at(`${path}.solutions`, 'must be a non-empty array') };
      }
      const solutions: TacticSolution[] = [];
      for (let j = 0; j < solsVal.length; j++) {
        const sol = solsVal[j];
        const sp = `${path}.solutions[${j}]`;
        if (!isRecord(sol)) return { ok: false, error: at(sp, 'must be an object') };

        // v1: { uci: "e2e4" }
        // v2: { lineUci: ["e2e4", "e7e5", ...] }
        const lineUciVal = sol['lineUci'];
        const hasLine = Array.isArray(lineUciVal) && lineUciVal.every((x) => typeof x === 'string');

        const uci = optionalString(sol, 'uci');
        const san = optionalString(sol, 'san');

        if (!hasLine && (!uci || uci.trim().length === 0)) {
          return { ok: false, error: at(sp, 'must have either "uci" (string) or "lineUci" (string[])') };
        }

        if (hasLine && (lineUciVal as any[]).length === 0) {
          return { ok: false, error: at(`${sp}.lineUci`, 'must be a non-empty array when provided') };
        }

        const lineUci = hasLine ? (lineUciVal as string[]) : [uci as string];
        solutions.push({ uci: uci ?? lineUci[0], san, lineUci });
      }
      items.push({
        ...common,
        type: 'tactic',
        goal: optionalString(item, 'goal'),
        solutions
      });
    } else if (type === 'openingLine') {
      const lineVal = item['line'];
      if (!Array.isArray(lineVal) || !lineVal.every((x) => typeof x === 'string')) {
        return { ok: false, error: at(`${path}.line`, 'must be an array of strings') };
      }
      items.push({
        ...common,
        type: 'openingLine',
        name: optionalString(item, 'name'),
        line: lineVal as string[]
      });
    } else if (type === 'endgame') {
      items.push({
        ...common,
        type: 'endgame',
        goal: optionalString(item, 'goal')
      });
    } else {
      const blocksVal = item['blocks'];
      let blocks: LessonBlock[] | undefined = undefined;

      if (blocksVal !== undefined) {
        if (!Array.isArray(blocksVal)) {
          return { ok: false, error: at(`${path}.blocks`, 'must be an array when provided') };
        }
        blocks = [];
        for (let j = 0; j < blocksVal.length; j++) {
          const b = blocksVal[j];
          const bp = `${path}.blocks[${j}]`;
          if (!isRecord(b)) return { ok: false, error: at(bp, 'must be an object') };
          const kind = b['kind'];
          if (kind !== 'markdown' && kind !== 'diagram' && kind !== 'tryMove') {
            return { ok: false, error: at(`${bp}.kind`, 'must be one of: markdown, diagram, tryMove') };
          }

          if (kind === 'markdown') {
            const md = requireString(b, 'markdown', bp);
            if (!md.ok) return md;
            blocks.push({ kind: 'markdown', markdown: md.value });
          } else if (kind === 'diagram') {
            const fen = requireString(b, 'fen', bp);
            if (!fen.ok) return fen;
            const orientation = optionalString(b, 'orientation');
            if (orientation && orientation !== 'w' && orientation !== 'b') {
              return { ok: false, error: at(`${bp}.orientation`, 'must be "w" or "b" when provided') };
            }
            blocks.push({
              kind: 'diagram',
              fen: fen.value,
              caption: optionalString(b, 'caption'),
              orientation: (orientation as 'w' | 'b' | undefined)
            });
          } else {
            const fen = requireString(b, 'fen', bp);
            if (!fen.ok) return fen;
            const prompt = requireString(b, 'prompt', bp);
            if (!prompt.ok) return prompt;

            const expectedVal = b['expectedUci'];
            const expectedOk =
              typeof expectedVal === 'string'
                ? expectedVal.trim().length > 0
                  ? expectedVal.trim()
                  : null
                : Array.isArray(expectedVal) && expectedVal.every((x) => typeof x === 'string' && x.trim().length > 0)
                  ? (expectedVal as string[])
                  : null;
            if (!expectedOk) {
              return { ok: false, error: at(`${bp}.expectedUci`, 'must be a non-empty string or string[]') };
            }

            const wrongBehavior = optionalString(b, 'wrongBehavior');
            if (wrongBehavior && wrongBehavior !== 'hint' && wrongBehavior !== 'rewind' && wrongBehavior !== 'reveal') {
              return { ok: false, error: at(`${bp}.wrongBehavior`, 'must be one of: hint, rewind, reveal') };
            }

            blocks.push({
              kind: 'tryMove',
              fen: fen.value,
              prompt: prompt.value,
              expectedUci: expectedOk as any,
              hintMarkdown: optionalString(b, 'hintMarkdown'),
              wrongBehavior: wrongBehavior as any
            });
          }
        }
      }

      items.push({
        ...common,
        type: 'lesson',
        title: optionalString(item, 'title'),
        markdown: optionalString(item, 'markdown'),
        blocks
      });
    }
  }

  return {
    ok: true,
    value: {
      id: idR.value,
      title: titleR.value,
      version: versionR.value,
      author: authorR.value,
      license: licenseR.value,
      tags: tagsR.value,
      items
    }
  };
}
