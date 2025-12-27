import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <section className="stack">
      <div className="card">
        <h2>Play</h2>
        <p className="muted">Start a game in a couple of clicks.</p>

        <div className="actions">
          <Link to="/local/setup" className="btn btn-primary">
            Play → Local
          </Link>
          <Link to="/vs-computer/setup" className="btn">
            Play → Vs Computer
          </Link>
        </div>
      </div>

      <div className="card">
        <h2>Training</h2>
        <p className="muted">Tactics, openings, endgames, lessons, and daily drills.</p>
        <div className="actions">
          <Link to="/training" className="btn btn-secondary">
            Open training
          </Link>
        </div>
      </div>

      <div className="card">
        <h2>History</h2>
        <p className="muted">See finished games saved on this device.</p>
        <div className="actions">
          <Link to="/history" className="btn btn-secondary">
            Open history
          </Link>
        </div>
      </div>
    </section>
  );
}
