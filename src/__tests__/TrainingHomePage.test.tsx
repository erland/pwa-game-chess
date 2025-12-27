import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { jest } from '@jest/globals';

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data
  } as Response);
}

describe('TrainingHomePage', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('renders and lists built-in packs', async () => {
    const user = userEvent.setup();

// JSDOM/Jest in this repo may not provide global fetch; define a stub so spyOn works.
if (!(globalThis as any).fetch) {
  (globalThis as any).fetch = (async () => {
    throw new Error('fetch was called without a mock');
  }) as any;
}

    const fetchSpy = jest
      .spyOn(globalThis, 'fetch' as any)
      .mockImplementation(async (...args: any[]) => {
        const input = args[0];
        const url =
          typeof input === 'string'
            ? input
            : input && typeof input === 'object' && 'url' in input
              ? String((input as any).url)
              : String(input);
      if (url.endsWith('training/packs/index.json')) {
        return okJson({
          packs: [{ id: 'basic', title: 'Basic Starter Pack', file: 'basic.json' }]
        });
      }
      if (url.endsWith('training/packs/basic.json')) {
        return okJson({
          id: 'basic',
          title: 'Basic Starter Pack',
          version: 1,
          author: 'me',
          license: 'CC0',
          tags: ['starter'],
          items: [
            {
              type: 'tactic',
              itemId: 't1',
              difficulty: 1,
              themes: ['mate'],
              position: { fen: '8/8/8/8/8/8/8/8 w - - 0 1' },
              solutions: [{ uci: 'a2a3' }]
            }
          ]
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });

    render(<App />);

    await user.click(screen.getByRole('link', { name: /open training/i }));
    expect(screen.getByRole('heading', { name: /^training$/i, level: 2 })).toBeInTheDocument();

    expect(await screen.findByText(/basic starter pack/i)).toBeInTheDocument();

    fetchSpy.mockRestore();
  });
});
