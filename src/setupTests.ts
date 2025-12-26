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

// React Router v6 emits "Future Flag" warnings in tests (and in dev) which are not actionable here.
// Keep test output clean by silencing only those specific warnings.
//
// Note: In some ESM Jest setups, the spy helper isn't available as a global in setup files.
// So we patch `console.warn` directly instead.
const __warn = console.warn.bind(console);

beforeAll(() => {
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    const msg = typeof first === 'string' ? first : String(first ?? '');
    if (msg.includes('React Router Future Flag Warning')) return;
    __warn(...(args as [unknown, ...unknown[]]));
  };
});

afterAll(() => {
  console.warn = __warn;
});

