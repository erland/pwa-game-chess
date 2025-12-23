import './App.css';

export default function App() {
  return (
    <div className="app">
      <header className="appHeader">
        <div className="appBadge">♞</div>
        <div>
          <h1>PWA Chess</h1>
          <p className="muted">
            Scaffold ready. Next step: App shell + navigation for Local mode.
          </p>
        </div>
      </header>

      <main className="card">
        <h2>Step 1 checklist</h2>
        <ul>
          <li>Vite + React + TypeScript scaffold ✅</li>
          <li>Jest test runner ✅</li>
          <li>PWA plugin configured ✅</li>
          <li>GitHub Pages workflow ✅</li>
        </ul>
      </main>

      <footer className="footer">
        <span className="muted">
          Repository base path: <code>/pwa-game-chess/</code>
        </span>
      </footer>
    </div>
  );
}
