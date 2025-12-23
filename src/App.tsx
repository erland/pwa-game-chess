import './App.css';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LocalSetupPage } from './pages/LocalSetupPage';
import { GamePage } from './pages/GamePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AppShell } from './ui/AppShell';

export default function App() {
  return (
    <HashRouter  future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/local/setup" element={<LocalSetupPage />} />
          <Route path="/local/game" element={<GamePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
