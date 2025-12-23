import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

describe('Local game controls (Step 10)', () => {
  beforeEach(() => {
    // HashRouter uses the global location hash. Reset between tests.
    window.location.hash = '#/';
  });

  it('allows offering a draw and shows a result screen', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /play → local/i }));
    await user.click(screen.getByRole('button', { name: /start game/i }));

    await user.click(screen.getByRole('button', { name: /offer draw/i }));
    const confirm = screen.getByRole('dialog', { name: /offer draw/i });
    await user.click(within(confirm).getByRole('button', { name: /agree draw/i }));

    const result = screen.getByRole('dialog', { name: /game result/i });
    expect(within(result).getByLabelText(/result summary/i)).toHaveTextContent(/draw — agreed/i);
  });

  it('allows resigning, and restart clears the result', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /play → local/i }));
    await user.click(screen.getByRole('button', { name: /start game/i }));

    await user.click(screen.getByRole('button', { name: /resign/i }));
    const confirm = screen.getByRole('dialog', { name: /resign/i });
    await user.click(within(confirm).getByRole('button', { name: /^resign$/i }));

    const result = screen.getByRole('dialog', { name: /game result/i });
    expect(within(result).getByLabelText(/result summary/i)).toHaveTextContent(/resigned/i);

    await user.click(within(result).getByRole('button', { name: /restart/i }));

    expect(screen.queryByRole('dialog', { name: /game result/i })).not.toBeInTheDocument();
    // New game should start with white to move.
    expect(screen.getByText(/^White$/)).toBeInTheDocument();
  });
});
