import '@testing-library/jest-dom';

// Jest (Node + JSDOM) may miss TextEncoder/TextDecoder in some environments.
// Polyfill them so libraries depending on them won't crash.
// (Keeps us aligned with our other PWAs where this often appears.)
import { TextDecoder, TextEncoder } from 'util';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g: any = globalThis as any;

if (!g.TextEncoder) g.TextEncoder = TextEncoder;
if (!g.TextDecoder) g.TextDecoder = TextDecoder;

// Ensure tests don't leak persisted chess history between runs.
beforeEach(() => {
  try {
    localStorage.removeItem('pwa-game-chess.games.v1');
  } catch {
    // ignore
  }
});
