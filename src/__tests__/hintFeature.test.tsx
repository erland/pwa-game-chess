import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { jest } from '@jest/globals';

import App from '../App';

describe('vs-computer hint feature', () => {
  beforeEach(() => {
    // HashRouter state persists between tests; reset to Home.
    window.location.hash = '#/';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a hint and highlights a suggested move', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<App />);

    await user.click(screen.getByRole('link', { name: /play → vs computer/i }));
    await user.click(screen.getByRole('button', { name: /start game/i }));
    expect(screen.getByRole('heading', { name: /vs computer game/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^hint$/i }));
    expect(screen.getByLabelText('Hint')).toHaveTextContent(/calculating hint/i);

    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Hint')).toHaveTextContent(/hint:/i);
    expect(document.querySelector('.boardSq-hintFrom')).toBeTruthy();
    expect(document.querySelector('.boardSq-hintTo')).toBeTruthy();
  });

  it('ignores a hint result if the player moves before it returns', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<App />);

    await user.click(screen.getByRole('link', { name: /play → vs computer/i }));
    await user.click(screen.getByRole('button', { name: /start game/i }));

    await user.click(screen.getByRole('button', { name: /^hint$/i }));
    expect(screen.getByLabelText('Hint')).toHaveTextContent(/calculating hint/i);

    // Make a quick move before the hint resolves: e2 -> e4
    await user.click(screen.getByRole('button', { name: 'Square e2, white pawn' }));
    await user.click(screen.getByRole('button', { name: 'Square e4' }));

    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(screen.queryByLabelText('Hint')).not.toBeInTheDocument();
    expect(document.querySelector('.boardSq-hintFrom')).toBeNull();
    expect(document.querySelector('.boardSq-hintTo')).toBeNull();
  });
});
