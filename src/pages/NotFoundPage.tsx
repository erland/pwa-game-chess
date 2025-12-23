import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="stack">
      <div className="card">
        <h2>Page not found</h2>
        <p className="muted">The page you were looking for doesn't exist.</p>
        <div className="actions">
          <Link to="/" className="btn btn-primary">
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}
