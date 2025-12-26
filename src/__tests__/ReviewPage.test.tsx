import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewPage } from '../pages/ReviewPage';
import { putGame } from '../storage/gamesDb';
import type { GameRecord, MoveRecord } from '../domain/recording/types';
import { createInitialGameState } from '../domain/gameState';
import { generateLegalMoves } from '../domain/legalMoves';
import { parseAlgebraicSquare } from '../domain/square';
import { applyMove } from '../domain/applyMove';
import type { GameState } from '../domain/chessTypes';

function pickMove(state: GameState, fromAlg: string, toAlg: string): MoveRecord {
  const from = parseAlgebraicSquare(fromAlg);
  const to = parseAlgebraicSquare(toAlg);
  if (from == null || to == null) throw new Error('bad square');

  const legal = generateLegalMoves(state, from);
  const mv = legal.find((m) => m.from === from && m.to === to);
  if (!mv) throw new Error(`move not legal: ${fromAlg}${toAlg}`);
  return { from: mv.from, to: mv.to, promotion: mv.promotion };
}

describe('ReviewPage', () => {
  it('loads a record, shows SAN moves, and supports keyboard stepping', async () => {
    let s = createInitialGameState();
    const m1 = pickMove(s, 'e2', 'e4');
    s = applyMove(s, { from: m1.from, to: m1.to, promotion: m1.promotion });
    const m2 = pickMove(s, 'e7', 'e5');

    const record: GameRecord = {
      id: 'review-1',
      mode: 'local',
      players: { white: 'Alice', black: 'Bob' },
      timeControl: { kind: 'none' },
      startedAtMs: 0,
      finishedAtMs: 5000,
      moves: [m1, m2],
      result: { result: '1-0', termination: 'resign', winner: 'w', loser: 'b' }
    };

    await putGame(record);

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={[`/review/${record.id}`]}>
        <Routes>
          <Route path="/review/:id" element={<ReviewPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Alice vs Bob/i)).toBeInTheDocument();

    // SAN list should contain e4 and e5
    expect(screen.getByRole('button', { name: /white: e4/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /black: e5/i })).toBeInTheDocument();

    // Initial ply is 0, step forward with ArrowRight
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('review-ply')).toHaveTextContent(/Ply\s+1\s*\/\s*2/i);

    // Notation section present
    expect(screen.getByLabelText(/^FEN$/i, { selector: 'pre' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^PGN$/i, { selector: 'pre' })).toBeInTheDocument();
  });
});