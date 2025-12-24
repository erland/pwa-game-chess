import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { jest } from '@jest/globals';

import App from '../App';

function getSideToMove(): string {
  const label = screen.getByText('Side to move');
  const container = label.parentElement;
  const value = container?.querySelector('.metaValue')?.textContent?.trim();
  if (!value) throw new Error('Could not read side-to-move value');
  return value;
}

function getStatusText(): string {
  const label = screen.getByText('Status');
  const container = label.parentElement;
  const value = container?.querySelector('.metaValue')?.textContent?.trim();
  if (!value) throw new Error('Could not read status value');
  return value;
}

describe('vs-computer game loop', () => {
  beforeEach(() => {
    // HashRouter state persists between tests; reset to Home.
    window.location.hash = '#/';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts vs-computer and makes the computer reply after a player move', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<App />);

    await user.click(screen.getByRole('link', { name: /play → vs computer/i }));
    expect(screen.getByRole('heading', { name: /vs computer setup/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /start game/i }));
    expect(screen.getByRole('heading', { name: /vs computer game/i })).toBeInTheDocument();

    expect(getSideToMove()).toBe('White');
    expect(getStatusText()).toMatch(/in progress|in check/i);

    // Make a simple opening move: e2 -> e4
    await user.click(screen.getByRole('button', { name: 'Square e2, white pawn' }));
    await user.click(screen.getByRole('button', { name: 'Square e4' }));

    // Now it should be the computer's turn, and the UI should show thinking.
    expect(getSideToMove()).toBe('Black');
    expect(screen.getByRole('status')).toHaveTextContent(/computer thinking/i);

    // Let the AI's think-time budget elapse.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // After the AI move, it should be White to move again.
    expect(getSideToMove()).toBe('White');
    expect(screen.queryByRole('status', { name: /computer thinking/i })).not.toBeInTheDocument();
  });

  it('resigning during AI thinking cancels the in-flight AI move (no stale move applied)', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<App />);

    await user.click(screen.getByRole('link', { name: /play → vs computer/i }));
    await user.click(screen.getByRole('button', { name: /start game/i }));

    // Player (White) makes a move to trigger AI thinking (Black).
    await user.click(screen.getByRole('button', { name: 'Square e2, white pawn' }));
    await user.click(screen.getByRole('button', { name: 'Square e4' }));

    expect(getSideToMove()).toBe('Black');
    expect(screen.getByRole('status')).toHaveTextContent(/computer thinking/i);

    // Resign while the computer is thinking.
    await user.click(screen.getByRole('button', { name: /resign/i }));
    expect(screen.getByRole('dialog', { name: /resign/i })).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog', { name: /resign/i })).getByRole('button', { name: /^resign$/i }));

    // Player was White, so White should be the loser even though it was Black to move.
    expect(getStatusText()).toMatch(/white resigned/i);

    // Stale AI move should NOT apply: side-to-move stays Black.
    expect(getSideToMove()).toBe('Black');

    // Even after advancing timers, AI should not apply a move.
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(getSideToMove()).toBe('Black');
    expect(getStatusText()).toMatch(/resigned/i);
  });

  it('if the player chooses Black, the computer (White) makes the first move', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<App />);

    await user.click(screen.getByRole('link', { name: /play → vs computer/i }));
    expect(screen.getByRole('heading', { name: /vs computer setup/i })).toBeInTheDocument();

    // Choose to play as Black.
    await user.click(screen.getByRole('radio', { name: /^black$/i }));
    await user.click(screen.getByRole('button', { name: /start game/i }));

    // White to move initially, so the computer should start thinking immediately.
    expect(getSideToMove()).toBe('White');
    expect(screen.getByRole('status', { name: /computer thinking/i })).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    // After the computer move, it should be Black (player) to move.
    expect(getSideToMove()).toBe('Black');
    expect(screen.queryByRole('status', { name: /computer thinking/i })).not.toBeInTheDocument();
  });
});
