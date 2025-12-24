import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

describe('App', () => {
  beforeEach(() => {
    // App uses HashRouter, so the URL hash persists between tests unless we reset it.
    window.location.hash = '#/';
  });

  it('lets the user start a local game (router smoke test)', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { name: /pwa chess/i })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /play → local/i }));
    expect(screen.getByRole('heading', { name: /local setup/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /start game/i }));
    expect(screen.getByRole('heading', { name: /local game/i })).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: /chess board/i })).toBeInTheDocument();
  });
  it('lets the user start a vs-computer game (router smoke test)', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /play → vs computer/i }));
    expect(screen.getByRole('heading', { name: /vs computer setup/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /start game/i }));
    expect(screen.getByRole('heading', { name: /vs computer game/i })).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: /chess board/i })).toBeInTheDocument();
  });

});