import './App.css';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LocalSetupPage } from './pages/LocalSetupPage';
import { VsComputerSetupPage } from './pages/VsComputerSetupPage';
import { GamePage } from './pages/GamePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { HistoryPage } from './pages/HistoryPage';
import { ReviewPage } from './pages/ReviewPage';
import { TrainingHomePage } from './pages/TrainingHomePage';
import { AppShell } from './ui/AppShell';
import { TrainingShell } from './pages/training/TrainingShell';
import { TrainingDailyPage } from './pages/training/TrainingDailyPage';
import { TrainingPacksPage } from './pages/training/TrainingPacksPage';
import { TrainingOpeningsPage } from './pages/training/TrainingOpeningsPage';
import { TrainingLessonsPage } from './pages/training/TrainingLessonsPage';
import { LessonPage } from './pages/training/LessonPage';
import { TrainingEndgamesPage } from './pages/training/TrainingEndgamesPage';
import { TrainingTacticsPage } from './pages/training/TrainingTacticsPage';
import { TrainingSessionSummaryPage } from './pages/training/TrainingSessionSummaryPage';

export default function App() {
  return (
    <HashRouter  future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/local/setup" element={<LocalSetupPage />} />
          <Route path="/vs-computer/setup" element={<VsComputerSetupPage />} />
          <Route path="/local/game" element={<GamePage />} />
          <Route path="/vs-computer/game" element={<GamePage />} />
          <Route path="/training" element={<TrainingShell />}>
            <Route index element={<TrainingHomePage />} />
            <Route path="session/:id" element={<TrainingSessionSummaryPage />} />
            <Route
              path="tactics"
              element={<TrainingTacticsPage />}
            />
            <Route
              path="openings"
              element={<TrainingOpeningsPage />}
            />
            <Route
              path="endgames"
              element={<TrainingEndgamesPage />}
            />
            <Route path="lessons" element={<TrainingLessonsPage />} />
            <Route path="lessons/:packId/:itemId" element={<LessonPage />} />
            <Route path="packs" element={<TrainingPacksPage />} />
            <Route
              path="daily"
              element={<TrainingDailyPage />}
            />
          </Route>
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/review/:id" element={<ReviewPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
