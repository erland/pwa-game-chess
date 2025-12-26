import { Link, Outlet } from 'react-router-dom';


export function AppShell() {
  return (
    <div className="app">
      <a className="skipLink" href="#main">
        Skip to content
      </a>

      <header className="appHeader">
        <Link to="/" className="appBadge appBadgeLink" aria-label="Go to Home">
          ♞
        </Link>
        <div className="appHeaderText">
          <h1>PWA Chess</h1>        </div>
      </header>

      <main id="main" className="content">
        <Outlet />
      </main>
    </div>
  );
}
