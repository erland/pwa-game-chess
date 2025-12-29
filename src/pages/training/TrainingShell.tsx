import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { TrainingSettingsProvider } from './TrainingSettingsContext';

function navClass({ isActive }: { isActive: boolean }) {
  return `navLink${isActive ? ' isActive' : ''}`;
}

type TrainingNavItem = { to: string; label: string; end?: boolean };

export function TrainingShell() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = useMemo<TrainingNavItem[]>(
    () => [
      { to: '/training', label: 'Overview', end: true },
      { to: '/training/tactics', label: 'Tactics' },
      { to: '/training/openings', label: 'Openings' },
      { to: '/training/endgames', label: 'Endgames' },
      { to: '/training/lessons', label: 'Lessons' },
      { to: '/training/packs', label: 'Packs' },
      { to: '/training/settings', label: 'Settings' },
      { to: '/training/daily', label: 'Daily' }
    ],
    []
  );

  // Close the overlay menu on navigation (important on mobile).
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Allow closing the menu with Escape even if focus isn't inside the overlay.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <section className="stack">
      <header className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Training</h2>
          <button
            type="button"
            className="btn btn-secondary trainingNavMenuButton"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            Select section
          </button>
        </div>

        <nav className="nav trainingNavDesktop" aria-label="Training navigation">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className={navClass}>
              {it.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {menuOpen && (
        <div
          className="trainingNavOverlayBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Training navigation"
          onClick={() => setMenuOpen(false)}
        >
          <div className="trainingNavOverlayPanel" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <strong>Training</strong>
              <button type="button" className="btn btn-secondary" onClick={() => setMenuOpen(false)}>
                Close
              </button>
            </div>

            <div className="trainingNavOverlayLinks">
              {items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={navClass}>
                  {it.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      <TrainingSettingsProvider>
        <Outlet />
      </TrainingSettingsProvider>
    </section>
  );
}
