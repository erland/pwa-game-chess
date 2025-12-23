import type { GameStatus } from '../domain/chessTypes';

export type ResultDialogProps = {
  status: Exclude<GameStatus, { kind: 'inProgress' }>;
  onRestart: () => void;
  onNewGame: () => void;
  onHome: () => void;
};

function formatResultTitle(status: Exclude<GameStatus, { kind: 'inProgress' }>): string {
  switch (status.kind) {
    case 'checkmate':
      return `Checkmate — ${status.winner === 'w' ? 'White' : 'Black'} wins`;
    case 'stalemate':
      return 'Draw — stalemate';
    case 'drawInsufficientMaterial':
      return 'Draw — insufficient material';
    case 'drawAgreement':
      return 'Draw — agreed';
    case 'timeout':
      return `Time out — ${status.winner === 'w' ? 'White' : 'Black'} wins`;
    case 'resign':
      return `${status.loser === 'w' ? 'White' : 'Black'} resigned — ${status.winner === 'w' ? 'White' : 'Black'} wins`;
  }
}

export function ResultDialog({ status, onRestart, onNewGame, onHome }: ResultDialogProps) {
  const title = formatResultTitle(status);

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label="Game result">
      <div className="modal">
        <h3 className="h3">Game over</h3>
        <p className="muted" aria-label="Result summary">
          {title}
        </p>

        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-primary" onClick={onRestart}>
            Restart
          </button>
          <button type="button" className="btn btn-secondary" onClick={onNewGame}>
            New game
          </button>
          <button type="button" className="btn btn-secondary" onClick={onHome}>
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
