import { render, screen, waitFor, within } from '@testing-library/react';
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
    // Drag handlers + React state updates can make the highlight appear on the next tick.
    await waitFor(() => expect(e4).toHaveClass('boardSq-legal'));

    await user.click(e4);

    // Pawn moved.
    const e4After = screen.getByRole('button', { name: /square e4, white pawn/i });
    const e2After = screen.getByRole('button', { name: /^square e2$/i });
    expect(e4After).toBeInTheDocument();
    expect(e2After).toBeInTheDocument();

    // Step 8 alignment: last move highlighting.
    expect(e2After).toHaveClass('boardSq-lastFrom');
    expect(e4After).toHaveClass('boardSq-lastTo');

    // Side to move flips.
    const sideToMove = screen.getByText(/side to move/i).closest('div');
    expect(sideToMove).not.toBeNull();
    expect(within(sideToMove as HTMLElement).getByText(/^Black$/i)).toBeInTheDocument();
  });
});
