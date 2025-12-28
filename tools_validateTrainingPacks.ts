import fs from 'node:fs';
import path from 'node:path';

import {
  validateTrainingPack,
  validateTrainingPackIndex,
  type TrainingPack,
  type TrainingItem,
  type TacticItem,
  type LessonItem,
  type OpeningLineItem
} from './src/domain/training/schema';

import { tryParseFEN } from './src/domain/notation/fen';
import { applyMove } from './src/domain/applyMove';

import {
  getSolutionLines,
  normalizeUci as normalizeTacticUci,
  uciToLegalMove as uciToLegalMoveTactic
} from './src/domain/training/tactics';

import {
  isUciLike,
  normalizeUci as normalizeOpenUci,
  uciToLegalMove as uciToLegalMoveOpening
} from './src/domain/training/openingsDrill';

function readJson(p: string): unknown {
  const txt = fs.readFileSync(p, 'utf8');
  return JSON.parse(txt);
}

function fail(msg: string): never {
  console.error(msg);
  process.exitCode = 1;
  throw new Error(msg);
}

function validateFen(label: string, fen: string) {
  const r = tryParseFEN(fen);
  if (!r.ok) fail(`${label}: invalid FEN: ${r.error}`);
  return r.value;
}

function validateTactic(pack: TrainingPack, item: TacticItem) {
  const base = validateFen(`${pack.id}:${item.itemId}`, item.position.fen);
  const lines = getSolutionLines(item);
  if (lines.length === 0) fail(`${pack.id}:${item.itemId}: no solutions`);

  for (let li = 0; li < lines.length; li++) {
    let s = base;
    const line = lines[li];
    for (let mi = 0; mi < line.length; mi++) {
      const uci = normalizeTacticUci(line[mi]);
      const m = uciToLegalMoveTactic(s, uci);
      if (!m) {
        fail(`${pack.id}:${item.itemId}: illegal move in solution line ${li + 1} ply ${mi + 1}: ${uci}`);
      }
      s = applyMove(s, m);
    }
  }
}

function validateOpening(pack: TrainingPack, item: OpeningLineItem) {
  let s = validateFen(`${pack.id}:${item.itemId}`, item.position.fen);
  const raw = item.line ?? [];
  if (raw.length === 0) fail(`${pack.id}:${item.itemId}: opening line is empty`);

  for (let i = 0; i < raw.length; i++) {
    const t = String(raw[i] ?? '');
    if (!isUciLike(t)) {
      // Not fatal, but our current training UI only uses UCI.
      fail(`${pack.id}:${item.itemId}: non-UCI move at index ${i}: ${t}`);
    }
    const uci = normalizeOpenUci(t);
    const m = uciToLegalMoveOpening(s, uci);
    if (!m) fail(`${pack.id}:${item.itemId}: illegal UCI at ply ${i + 1}: ${uci}`);
    s = applyMove(s, m);
  }
}

function validateLesson(pack: TrainingPack, item: LessonItem) {
  // Validate top-level position (used as thumbnail)
  validateFen(`${pack.id}:${item.itemId}`, item.position.fen);

  const blocks = item.blocks ?? [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === 'diagram') {
      validateFen(`${pack.id}:${item.itemId}:blocks[${i}].diagram`, b.fen);
    }
    if (b.kind === 'tryMove') {
      const s = validateFen(`${pack.id}:${item.itemId}:blocks[${i}].tryMove`, b.fen);
      const expected = Array.isArray(b.expectedUci) ? b.expectedUci : [b.expectedUci];
      if (expected.length === 0) fail(`${pack.id}:${item.itemId}: tryMove has no expectedUci`);
      let okAny = false;
      for (const u0 of expected) {
        const uci = normalizeTacticUci(String(u0));
        const m = uciToLegalMoveTactic(s, uci);
        if (m) {
          okAny = true;
          break;
        }
      }
      if (!okAny) fail(`${pack.id}:${item.itemId}: tryMove expectedUci contains no legal moves`);
    }
  }
}

function validatePack(pack: TrainingPack) {
  // Unique itemIds
  const seen = new Set<string>();
  for (const it of pack.items) {
    if (seen.has(it.itemId)) fail(`${pack.id}: duplicate itemId: ${it.itemId}`);
    seen.add(it.itemId);
  }

  for (const it of pack.items) {
    // Validate main position always
    validateFen(`${pack.id}:${it.itemId}`, it.position.fen);

    if (it.type === 'tactic') validateTactic(pack, it as TacticItem);
    else if (it.type === 'openingLine') validateOpening(pack, it as OpeningLineItem);
    else if (it.type === 'lesson') validateLesson(pack, it as LessonItem);
    else {
      // endgame: position fen already validated
    }
  }
}

function main() {
  const packsRoot = path.join(process.cwd(), 'public', 'training', 'packs');
  const indexPath = path.join(packsRoot, 'index.json');

  const idxRaw = readJson(indexPath);
  const idxVal = validateTrainingPackIndex(idxRaw);
  if (!idxVal.ok) fail(idxVal.error);

  const entries = idxVal.value.packs;
  if (entries.length === 0) fail('No packs in index.json');

  const packIds = new Set<string>();

  for (const e of entries) {
    if (packIds.has(e.id)) fail(`index.json: duplicate pack id: ${e.id}`);
    packIds.add(e.id);

    const packPath = path.join(packsRoot, e.file);
    if (!fs.existsSync(packPath)) fail(`index.json references missing file: ${e.file}`);

    const raw = readJson(packPath);
    const val = validateTrainingPack(raw);
    if (!val.ok) fail(`${e.file}: ${val.error}`);

    validatePack(val.value);
  }

  console.log(`OK: validated ${entries.length} pack(s).`);
}

main();
