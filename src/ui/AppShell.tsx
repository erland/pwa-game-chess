import { Link, Outlet } from 'react-router-dom';

export function AppShell() {
  return (
    <div className="app">
      <header className="appHeader">
        <div className="appBadge" aria-hidden>
          ♞
        </div>
        <div className="appHeaderText">
          <h1>PWA Chess</h1>
          <nav className="nav" aria-label="Primary">
            <Link to="/" className="navLink">
              Home
            </Link>
            <Link to="/local/setup" className="navLink">
              Local
            </Link>
          </nav>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <footer className="footer">
        <span className="muted">
          v1 focus: Local play • Repository base path: <code>/pwa-game-chess/</code>
        </span>
      </footer>
    </div>
  );
}
