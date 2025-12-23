# pwa-game-chess

A Progressive Web App (PWA) chess game built with **React + TypeScript** and deployed to **GitHub Pages**.

## Local development

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

## Quality gates

Run the same checks as CI:

```bash
npm run check
```

## Build

```bash
npm run build
npm run preview
```

## GitHub Pages deployment

This repo contains a GitHub Actions workflow that builds and deploys `/dist` to GitHub Pages.

Important details:
- `vite.config.ts` sets `base: '/pwa-game-chess/'` (must match the repository name).
- In GitHub: **Settings → Pages → Build and deployment → Source = GitHub Actions**.

Once enabled, pushes to `main` deploy to:

`https://<user>.github.io/pwa-game-chess/`

## PWA install / offline

- When served from GitHub Pages (or locally via HTTPS), the app registers a service worker.
- You can install it from your browser’s “Install app” / “Add to Home Screen” menu.
- Navigation requests fall back to the app shell even when offline.
