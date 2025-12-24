import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';

describe('vs-computer hint feature', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('shows a hint note and highlights a suggested move', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /play → vs computer/i }));
    await user.click(screen.getByRole('button', { name: /start game/i }));
    expect(screen.getByRole('heading', { name: /vs computer game/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^hint$/i }));

    const hint = await screen.findByRole('note', { name: /hint/i });
    expect(hint).toHaveTextContent(/hint:/i);

    // We don't assert a specific move; just ensure at least one hinted square is highlighted.
    expect(document.querySelector('.boardSq-hintFrom')).toBeTruthy();
    expect(document.querySelector('.boardSq-hintTo')).toBeTruthy();
  });
});
