# PWA Chess

A **Progressive Web App (PWA)** chess game built with **React + TypeScript** and deployed to **GitHub Pages**.

**Live app:** https://erland.github.io/pwa-game-chess/

---

## What you can do

### Play
- **Local (hot‑seat)**: play two-player chess on one device.
- **Vs computer**: play against built-in bots (a fast heuristic bot, with an optional stronger engine path).

### Review & history
- Finished games are stored **locally on the device** (IndexedDB with a localStorage fallback).
- **Review** games move-by-move.
- **Import PGN** into history (then review it like any other game).

### Training
A complete training area with:
- **Tactics**
- **Openings**
- **Endgames**
- **Lessons**
- **Daily drills**
- **Training packs** (bundled JSON packs + optional custom packs stored locally)

Training progress is tracked locally and uses scheduling fields (e.g., due time / streak / interval) so you can revisit items over time.

### PWA / offline
- Service worker is registered via `vite-plugin-pwa`.
- The app is installable (“Add to Home Screen” / “Install app”) when served over HTTPS (including GitHub Pages).
- Offline navigation falls back to the app shell so the UI remains usable without network.

---

## Getting started

### Prerequisites
- Node.js (the GitHub Actions workflow uses Node 20)

### Install & run
```bash
npm install
npm run dev
```

### Build
```bash
npm run build
```

### Tests
```bash
npm test
# or
npm run test:watch
```

### One-command sanity check
```bash
npm run check
```

---

## Project structure (where things belong)

This repo is intentionally split by responsibility:

- `src/domain/` — **pure chess + training logic** (no React, no DOM)
  - chess rules engine (move generation, legality, state transitions, notation, etc.)
  - training session reducers/selectors in `src/domain/training/session/`
  - selection policy (“pick next item”) in `src/domain/training/pickers/`
- `src/pages/` — route-level pages/controllers
  - `src/pages/training/` contains training screens + controllers
  - shared training hooks live in `src/pages/training/hooks/`
- `src/ui/` — reusable UI components (dialogs, board UI pieces, layout shell)
- `src/storage/` — persistence primitives (IndexedDB + fallback)
- `src/services/` — higher-level persistence workflows (“repos”) that coordinate multiple stores
- `src/workers/` — Web Worker entry points (used for stronger engine paths)
- `public/training/packs/` — bundled training packs + `index.json`
- `tools/` — offline utilities (see “Lichess pack generator” below)
- `docs/` — development plans / notes

If you’re wondering “where should this code go?”:
- **Rules / algorithms / reducers** → `src/domain/**`
- **Persistence details** → `src/storage/**`
- **Cross-store workflows** → `src/services/**`
- **UI rendering** → `src/ui/**`
- **Route + orchestration** → `src/pages/**`

---

## Training packs

### Built-in packs
Bundled packs are served from `public/training/packs/` and referenced by:
- `public/training/packs/index.json`

### Custom packs
The app supports storing custom packs locally (IndexedDB + fallback). Packs are validated against the schema in:
- `src/domain/training/schema.ts`

---

## Lichess pack generator (offline)

There is an offline tool that converts the **Lichess puzzle database CSV** into this app’s training-pack JSON format.

- Tool: `tools/lichess-pack-generator/generate-lichess-packs.mjs`
- Tool docs: `tools/lichess-pack-generator/README.md`

Typical usage:
```bash
node tools/lichess-pack-generator/generate-lichess-packs.mjs \
  --input /path/to/lichess_db_puzzle.csv \
  --outDir public/training/packs/generated \
  --indexFile public/training/packs/index.json \
  --replaceGenerated \
  --maxPerPack 2000
```

After generating, run the app and the packs appear under **Training → Packs**.

---

## Deployment (GitHub Pages)

This repo is configured to deploy via GitHub Actions (`.github/workflows/deploy.yml`).

Important notes:
- `vite.config.ts` sets `base: '/pwa-game-chess/'` (must match the repository name).
- Routing uses `HashRouter` so deep links work on GitHub Pages.

In GitHub:
- **Settings → Pages → Build and deployment → Source = GitHub Actions**

Once enabled, pushes to `main` deploy to:
- https://erland.github.io/pwa-game-chess/

---

## License
See the repository for licensing details (or add a LICENSE file if you want an explicit license).
