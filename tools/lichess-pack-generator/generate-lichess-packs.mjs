#!/usr/bin/env node
/**
 * Lichess Puzzle CSV -> TrainingPack JSON generator (offline)
 *
 * Usage:
 *   node tools/lichess-pack-generator/generate-lichess-packs.mjs \
 *     --input /path/to/lichess_db_puzzle.csv \
 *     --outDir public/training/packs/generated \
 *     --indexFile public/training/packs/index.json \
 *     --replaceGenerated \
 *     --maxPerPack 2000
 *
 * Notes:
 * - Dependency-free and streams the CSV line-by-line (works for very large files).
 * - Produces packs split by (primary) theme + difficulty bucket (1..5).
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

/** Minimal CSV parser supporting quoted fields and escaped quotes (""). */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

function slug(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function titleizeTheme(theme) {
  // keep camelCase themes readable: discoveredAttack -> Discovered Attack
  const withSpaces = String(theme)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ');
  return withSpaces
    .split(' ')
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(' ');
}

function toInt(s, fallback = 0) {
  const n = Number.parseInt(String(s), 10);
  return Number.isFinite(n) ? n : fallback;
}

function mapRatingToDifficulty(rating) {
  // Simple buckets; tweak to taste.
  // 1: beginner … 5: very hard
  if (rating <= 900) return 1;
  if (rating <= 1200) return 2;
  if (rating <= 1500) return 3;
  if (rating <= 1900) return 4;
  return 5;
}

/**
 * Pick a single "primary" theme for grouping.
 * Lichess themes often include meta-tags like opening/middlegame/endgame, etc.
 * We prioritize tactical pattern tags first.
 */
const THEME_PRIORITY = [
  // mates
  'mateIn1','mateIn2','mateIn3','mateIn4','mateIn5','mateIn6','mateIn7','mateIn8','mateIn9','mateIn10','mate',
  'backRankMate','smotheredMate','anastasiaMate','bodenMate','arabianMate','dovetailMate','hookMate',
  // core tactics
  'fork','pin','skewer','discoveredAttack','doubleAttack','xRayAttack','zwischenzug',
  'deflection','decoy','attraction','interference','clearance','overloading','removeDefender','trappedPiece',
  'sacrifice','exposedKing','hangingPiece','endgameTactic','quietMove',
  // theme-ish
  'promotion','underPromotion','advancedPawn','enPassant'
];

const META_THEMES = new Set([
  'opening','middlegame','endgame',
  'short','long',
  'advantage','equality','crushing',
  'oneMove','twoMoves','threeMoves','fourMoves','fiveMoves',
  'master','masterVsMaster'
]);

function pickPrimaryTheme(themesArr, allowedSet) {
  if (!Array.isArray(themesArr) || themesArr.length === 0) return 'misc';

  const filtered = themesArr.filter((t) => t && !META_THEMES.has(t));
  if (allowedSet && allowedSet.size > 0) {
    const allowedFirst = filtered.find((t) => allowedSet.has(t));
    if (allowedFirst) return allowedFirst;
  }

  const prioritized = filtered.find((t) => THEME_PRIORITY.includes(t));
  if (prioritized) return prioritized;

  // fallback: first non-meta theme, else first raw theme
  return filtered[0] ?? themesArr[0] ?? 'misc';
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function relFromPacksRoot(outDirAbs) {
  // We expect outDir to live under public/training/packs
  // but compute a relative segment if possible.
  const parts = outDirAbs.split(path.sep);
  const idx = parts.lastIndexOf('packs');
  if (idx >= 0 && idx < parts.length - 1) {
    return parts.slice(idx + 1).join('/');
  }
  return '';
}

function formatPackId(theme, difficulty, part) {
  return `lichess-${slug(theme)}-d${difficulty}${part > 1 ? `-p${part}` : ''}`;
}

function formatPackTitle(theme, difficulty, part) {
  return `Lichess Puzzles: ${titleizeTheme(theme)} (D${difficulty}${part > 1 ? `, Part ${part}` : ''})`;
}

async function main() {
  const args = parseArgs(process.argv);

  const input = args.input;
  const outDir = args.outDir ?? 'public/training/packs/generated';
  const indexFile = args.indexFile ?? 'public/training/packs/index.json';

  if (!input) {
    console.error('Missing --input /path/to/lichess_db_puzzle.csv');
    process.exit(2);
  }

  const maxPerPack = toInt(args.maxPerPack ?? '2000', 2000);
  const limit = args.limit ? toInt(args.limit, 0) : 0;

  const minRating = args.minRating ? toInt(args.minRating, 0) : 0;
  const maxRating = args.maxRating ? toInt(args.maxRating, 0) : 0;

  const allowedThemes = typeof args.themes === 'string'
    ? args.themes.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const allowedSet = new Set(allowedThemes);

  const replaceGenerated = !!args.replaceGenerated;
  const writeIndex = args.writeIndex === undefined ? true : !!args.writeIndex;

  const rootDir = process.cwd();
  const outDirAbs = path.resolve(rootDir, outDir);
  ensureDir(outDirAbs);

  console.log(`Reading: ${input}`);
  console.log(`Writing packs to: ${outDirAbs}`);
  console.log(`maxPerPack: ${maxPerPack}`);
  if (allowedSet.size) console.log(`themes filter: ${[...allowedSet].join(', ')}`);
  if (minRating) console.log(`minRating: ${minRating}`);
  if (maxRating) console.log(`maxRating: ${maxRating}`);
  if (limit) console.log(`limit: ${limit}`);

  const rl = readline.createInterface({
    input: fs.createReadStream(input, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  let header = null;
  let col = {};
  let rowsRead = 0;
  let kept = 0;

  // Streaming builders: key -> { theme, difficulty, part, items[] }
  const builders = new Map();

  const now = new Date().toISOString().slice(0, 10);
  const outEntries = [];

  const packsRootRel = relFromPacksRoot(outDirAbs); // e.g. "generated"
  const packsRootRelPrefix = packsRootRel ? `${packsRootRel.replace(/\/+$/,'')}/` : '';

  function flushBuilder(b) {
    if (!b.items.length) return;

    const packId = formatPackId(b.theme, b.difficulty, b.part);
    const title = formatPackTitle(b.theme, b.difficulty, b.part);
    const filename = `${packId}.json`;

    const pack = {
      id: packId,
      title,
      version: 1,
      author: 'Lichess community (generated)',
      license: 'CC0',
      tags: ['lichess', 'generated', String(b.theme), `d${b.difficulty}`, `generated-${now}`],
      items: b.items
    };

    fs.writeFileSync(path.join(outDirAbs, filename), JSON.stringify(pack, null, 2), 'utf8');

    outEntries.push({
      id: packId,
      title,
      file: `${packsRootRelPrefix}${filename}`,
      description: `Generated from Lichess puzzle DB. Theme: ${b.theme}. Difficulty bucket: ${b.difficulty}.`,
      tags: ['lichess', 'generated', String(b.theme), `d${b.difficulty}`]
    });

    b.items = [];
    b.part++;
  }

  function getBuilder(theme, difficulty) {
    const key = `${theme}::${difficulty}`;
    let b = builders.get(key);
    if (!b) {
      b = { theme, difficulty, part: 1, items: [] };
      builders.set(key, b);
    }
    return b;
  }

  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line);
      col = Object.fromEntries(header.map((h, i) => [h, i]));
      for (const required of ['PuzzleId', 'FEN', 'Moves', 'Rating', 'Themes']) {
        if (!(required in col)) {
          console.error(`CSV missing expected column: ${required}`);
          console.error(`Found columns: ${header.join(', ')}`);
          process.exit(3);
        }
      }
      continue;
    }
    if (!line.trim()) continue;

    rowsRead++;
    if (limit && rowsRead > limit) break;

    const row = parseCsvLine(line);
    const puzzleId = row[col.PuzzleId];
    const fen = row[col.FEN];
    const movesStr = row[col.Moves];
    const rating = toInt(row[col.Rating], 0);
    const themesStr = row[col.Themes] ?? '';
    const gameUrl = ('GameUrl' in col) ? row[col.GameUrl] : undefined;

    if (!puzzleId || !fen || !movesStr) continue;
    if (minRating && rating < minRating) continue;
    if (maxRating && rating > maxRating) continue;

    const themesArr = themesStr.split(' ').map((t) => t.trim()).filter(Boolean);
    const primaryTheme = pickPrimaryTheme(themesArr, allowedSet);
    const difficulty = mapRatingToDifficulty(rating);

    const moves = movesStr.split(' ').map((m) => m.trim()).filter(Boolean);
    if (moves.length === 0) continue;

    const item = {
      type: 'tactic',
      itemId: puzzleId,
      difficulty,
      themes: themesArr.length ? themesArr : [primaryTheme],
      source: gameUrl ? `lichess:${gameUrl}` : 'lichess',
      notes: `lichess rating ${rating}`,
      position: { fen },
      solutions: [{ lineUci: moves }]
    };

    const b = getBuilder(primaryTheme, difficulty);
    b.items.push(item);
    kept++;

    if (b.items.length >= maxPerPack) {
      flushBuilder(b);
    }

    if (rowsRead % 250000 === 0) {
      console.log(`Progress: read ${rowsRead.toLocaleString()} rows, kept ${kept.toLocaleString()} items, builders ${builders.size}`);
    }
  }

  // Flush remaining partial packs
  for (const b of builders.values()) flushBuilder(b);

  console.log(`Read rows: ${rowsRead.toLocaleString()}`);
  console.log(`Kept tactics: ${kept.toLocaleString()}`);
  console.log(`Wrote packs: ${outEntries.length.toLocaleString()}`);

  if (writeIndex) {
    const indexAbs = path.resolve(rootDir, indexFile);
    let indexObj = { packs: [] };

    if (fs.existsSync(indexAbs)) {
      indexObj = JSON.parse(fs.readFileSync(indexAbs, 'utf8'));
      if (!indexObj || typeof indexObj !== 'object' || !Array.isArray(indexObj.packs)) {
        console.error(`Index file is not a TrainingPackIndex: ${indexAbs}`);
        process.exit(4);
      }
    }

    const before = indexObj.packs.length;

    let packs = indexObj.packs;
    if (replaceGenerated) {
      packs = packs.filter((p) => !(p && typeof p.id === 'string' && p.id.startsWith('lichess-')));
    }
    packs = packs.concat(outEntries);

    const originals = packs.filter((p) => !(p && typeof p.id === 'string' && p.id.startsWith('lichess-')));
    const generated = packs
      .filter((p) => p && typeof p.id === 'string' && p.id.startsWith('lichess-'))
      .sort((a, b) => String(a.title).localeCompare(String(b.title)));

    indexObj.packs = originals.concat(generated);

    fs.writeFileSync(indexAbs, JSON.stringify(indexObj, null, 2), 'utf8');
    console.log(`Updated index: ${indexAbs}`);
    console.log(`Index packs: ${before} -> ${indexObj.packs.length}`);
    if (replaceGenerated) console.log('Replaced prior generated lichess-* entries.');
  } else {
    console.log('Skipping index update (use --writeIndex to enable).');
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
