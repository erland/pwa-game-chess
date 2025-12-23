import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  formatOrientation,
  formatTimeControl,
  parseOrientationParam,
  parseTimeControlParam
} from '../domain/localSetup';

function makeLocalGameId(): string {
  return `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function GamePage() {
  const [searchParams] = useSearchParams();

  const timeControl = parseTimeControlParam(searchParams.get('tc'));
  const orientation = parseOrientationParam(searchParams.get('o'));

  const gameId = useMemo(() => makeLocalGameId(), []);

  if (!timeControl || !orientation) {
    return (
      <section className="stack">
        <div className="card">
          <h2>Missing or invalid setup</h2>
          <p className="muted">
            This page expects setup parameters in the URL. Please go back and start a new local game.
          </p>
          <div className="actions">
            <Link to="/local/setup" className="btn btn-primary">
              Go to local setup
            </Link>
            <Link to="/" className="btn btn-secondary">
              Home
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const squares = useMemo(() => Array.from({ length: 64 }, (_, i) => i), []);

  return (
    <section className="stack">
      <div className="card">
        <h2>Local game</h2>
        <p className="muted">
          Game ID: <code>{gameId}</code>
        </p>

        <dl className="dl">
          <div>
            <dt>Time control</dt>
            <dd>{formatTimeControl(timeControl)}</dd>
          </div>
          <div>
            <dt>Orientation</dt>
            <dd>{formatOrientation(orientation)}</dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <h3 className="h3">Board (placeholder)</h3>
        <div className="boardPlaceholder" role="img" aria-label="Chess board placeholder">
          {squares.map((idx) => {
            const file = idx % 8;
            const rank = Math.floor(idx / 8);
            const isDark = (file + rank) % 2 === 1;
            return <div key={idx} className={isDark ? 'sq sq-dark' : 'sq sq-light'} />;
          })}
        </div>
        <p className="muted">
          The real board, pieces, move input, and rules engine arrive in the next steps.
        </p>

        <div className="actions">
          <Link to="/local/setup" className="btn btn-primary">
            New game
          </Link>
          <Link to="/" className="btn btn-secondary">
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}
