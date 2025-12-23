import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App', () => {
  it('renders the scaffold heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /pwa chess/i })).toBeInTheDocument();
  });
});
