import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { ErrorBoundary } from './ErrorBoundary';


export function AppShell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);

  // Accessibility: move focus to the main region on navigation.
  // This prevents keyboard/screen-reader users from needing to tab through
  // header + navigation on every route change.
  useEffect(() => {
    // Defer so the new route content is mounted before focusing.
    const id = window.setTimeout(() => {
      mainRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [location.pathname, location.search, location.hash]);

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

      <main id="main" className="content" ref={mainRef} tabIndex={-1}>
        <ErrorBoundary resetKey={`${location.pathname}${location.search}${location.hash}`}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
