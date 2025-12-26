import { NavLink, Outlet } from 'react-router-dom';

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'navLink isActive' : 'navLink';
}

export function AppShell() {
  return (
    <div className="app">
      <a className="skipLink" href="#main">
        Skip to content
      </a>

      <header className="appHeader">
        <div className="appBadge" aria-hidden>
          ♞
        </div>
        <div className="appHeaderText">
          <h1>PWA Chess</h1>
          <nav className="nav" aria-label="Primary">
            <NavLink to="/" className={navClass} end>
              Home
            </NavLink>
            <NavLink to="/local/setup" className={navClass}>
              Local
            </NavLink>
            <NavLink to="/vs-computer/setup" className={navClass}>
              Vs Computer
            </NavLink>
            <NavLink to="/history" className={navClass}>
              History
            </NavLink>
          </nav>
        </div>
      </header>

      <main id="main" className="content">
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
