import { NavLink, Outlet } from 'react-router-dom';

function navClass({ isActive }: { isActive: boolean }) {
  return `navLink${isActive ? ' isActive' : ''}`;
}

export function TrainingShell() {
  return (
    <section className="stack">
      <header className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>Training</h2>
        </div>

        <nav className="nav" aria-label="Training navigation">
          <NavLink to="/training" end className={navClass}>
            Overview
          </NavLink>
          <NavLink to="/training/tactics" className={navClass}>
            Tactics
          </NavLink>
          <NavLink to="/training/openings" className={navClass}>
            Openings
          </NavLink>
          <NavLink to="/training/endgames" className={navClass}>
            Endgames
          </NavLink>
          <NavLink to="/training/lessons" className={navClass}>
            Lessons
          </NavLink>
          <NavLink to="/training/daily" className={navClass}>
            Daily
          </NavLink>
        </nav>
      </header>

      <Outlet />
    </section>
  );
}
