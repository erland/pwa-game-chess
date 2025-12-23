import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';

import type { Move, Square } from '../../domain/chessTypes';
import { PromotionChooser } from '../PromotionChooser';

describe('PromotionChooser', () => {
  it('renders choices and returns the selected promotion move', async () => {
    const user = userEvent.setup();

    const from = 48 as Square; // a7
    const to = 56 as Square; // a8

    const opts: Move[] = [
      { from, to, promotion: 'q' },
      { from, to, promotion: 'r' },
      { from, to, promotion: 'b' },
      { from, to, promotion: 'n' }
    ];

    const onChoose = jest.fn();
    const onCancel = jest.fn();

    render(<PromotionChooser color="w" options={opts} onChoose={onChoose} onCancel={onCancel} />);

    expect(screen.getByRole('dialog', { name: /choose promotion/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /queen/i }));

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose.mock.calls[0][0]).toMatchObject({ from, to, promotion: 'q' });
  });
});
