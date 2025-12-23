import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

describe('Local game board', () => {
  it('lets the user select a piece, highlights legal moves, and applies a move', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /play → local/i }));
    await user.click(screen.getByRole('button', { name: /start game/i }));

    const e2 = screen.getByRole('button', { name: /square e2, white pawn/i });
    await user.click(e2);

    // e4 should be legal from the starting position.
    const e4 = screen.getByRole('button', { name: /square e4/i });
    expect(e4).toHaveClass('boardSq-legal');

    await user.click(e4);

    // Pawn moved.
    expect(screen.getByRole('button', { name: /square e4, white pawn/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^square e2$/i })).toBeInTheDocument();

    // Side to move flips.
    expect(screen.getByText(/black/i)).toBeInTheDocument();
  });
});
