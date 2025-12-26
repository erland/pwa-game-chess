import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryPage } from '../pages/HistoryPage';
import { putGame } from '../storage/gamesDb';
import type { GameRecord } from '../domain/recording/types';

describe('HistoryPage', () => {
  it('lists games and allows deleting a game', async () => {
    const record: GameRecord = {
      id: 'game-1',
      mode: 'local',
      players: { white: 'Alice', black: 'Bob' },
      timeControl: { kind: 'none' },
      startedAtMs: 1000,
      finishedAtMs: 5000,
      initialFen: null,
      moves: [],
      result: { result: '1-0', termination: 'resign', winner: 'w', loser: 'b' }
    };

    await putGame(record);

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/history']}>
        <HistoryPage />
      </MemoryRouter>
    );

    // Loads async
    expect(await screen.findByText(/Alice vs Bob/i)).toBeInTheDocument();
    expect(screen.getByText(/^\s*1-0\s*•/i)).toBeInTheDocument();

    // Delete flow
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByText(/Delete game\?/i)).toBeInTheDocument();

    // Confirm (use the dialog's Delete button, not the list item's)
    const dialog = screen.getByRole('dialog', { name: /delete game\?/i });
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Alice vs Bob/i)).not.toBeInTheDocument();
    });
  });
});
