import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';
import App from '../App';

function setHash(hash: string) {
  window.location.hash = hash;
}

describe('Local clocks (Step 11)', () => {
  beforeEach(() => {
    setHash('#/');
  });

  it('counts down for side to move and switches after a move (Fischer)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2020-01-01T00:00:00Z'));

    // Start directly on the game route with 1+2 (1 minute, 2 sec increment) to keep the test short.
    // NOTE: '+' in query strings is decoded as a space, so we must URL-encode it.
    setHash('#/local/game?tc=1%2B2&o=w');

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<App />);

    const whiteClock = await screen.findByLabelText(/white clock/i);
    const blackClock = screen.getByLabelText(/black clock/i);

    expect(whiteClock).toHaveTextContent('1:00');
    expect(blackClock).toHaveTextContent('1:00');

    // Let ~2 seconds pass for White.
    act(() => {
      jest.advanceTimersByTime(2200);
    });

    // White should have ticked down.
    expect(whiteClock.textContent).not.toBe('1:00');

    // Make a quick legal move: e2 -> e4
    await user.click(screen.getByRole('button', { name: /square e2/i }));
    await user.click(screen.getByRole('button', { name: /square e4/i }));

    // After White moves, White receives +2s increment; it should be close to (or back to) 1:00.
    expect(screen.getByLabelText(/white clock/i).textContent).toMatch(/^(0:5\d|1:0\d)$/);

    // Now it's Black to move; let ~1 second pass and ensure Black ticks down.
    const blackBefore = screen.getByLabelText(/black clock/i).textContent;
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    const blackAfter = screen.getByLabelText(/black clock/i).textContent;
    expect(blackAfter).not.toBe(blackBefore);

    jest.useRealTimers();
  });

  it('ends the game on time out', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2020-01-01T00:00:00Z'));

    // 0+0 => immediate time out for the side to move (white).
    // NOTE: '+' in query strings is decoded as a space, so we must URL-encode it.
    setHash('#/local/game?tc=0%2B0&o=w');

    render(<App />);

    // Allow effects to run.
    act(() => {
      jest.advanceTimersByTime(10);
    });

    const result = await screen.findByRole('dialog', { name: /game result/i });
    expect(result).toHaveTextContent(/time out/i);

    jest.useRealTimers();
  });
});
