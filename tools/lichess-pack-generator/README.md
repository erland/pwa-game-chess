# Lichess pack generator (offline)

This tool converts the **Lichess puzzle database CSV** into your app’s `TrainingPack` JSON format, **splitting into multiple packs by (primary) theme + difficulty bucket**.

## Prerequisites
- Node.js (no extra dependencies)
- A local copy of `lichess_db_puzzle.csv` (downloaded separately)

## One-command usage

From the repo root:

```bash
node tools/lichess-pack-generator/generate-lichess-packs.mjs \
  --input /path/to/lichess_db_puzzle.csv \
  --outDir public/training/packs/generated \
  --indexFile public/training/packs/index.json \
  --replaceGenerated \
  --maxPerPack 2000
```

Then run the app and the generated packs should show up under **Training → Packs**.

## Options
- `--input` (required): path to the CSV
- `--outDir`: where to write packs (default: `public/training/packs/generated`)
- `--indexFile`: which index to update (default: `public/training/packs/index.json`)
- `--replaceGenerated`: remove existing `lichess-*` entries from the index before adding new ones
- `--maxPerPack`: max items per pack file (default: 2000)
- `--themes`: comma-separated allow-list of themes to keep (e.g. `--themes mate,fork,pin`)
- `--minRating`, `--maxRating`: filter by rating
- `--limit`: stop after N rows (handy for a quick test run)

## Notes on splitting
- Each puzzle often has multiple tags in `Themes`.
- For grouping, we pick a single **primary** theme using a priority list (mates, then core tactical motifs) and fall back to the first non-meta tag.
- Difficulty is derived from rating buckets (tweak `mapRatingToDifficulty()` if you want different thresholds).

## Output
- Writes `*.json` pack files to `outDir`
- Updates `indexFile` by appending generated pack entries (and optionally replacing older ones)

