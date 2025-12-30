import { useTrainingSettings } from './TrainingSettingsContext';
import { LessonPageView } from './LessonPageView';
import { useLessonController } from './useLessonController';

export function LessonPage() {
  const { settings } = useTrainingSettings();
  const showHintSquares = settings.hintStyle === 'squares' || settings.hintStyle === 'both';
  const showHintArrow = settings.hintStyle === 'arrow' || settings.hintStyle === 'both';

  const vm = useLessonController();

  return <LessonPageView {...vm} showHintSquares={showHintSquares} showHintArrow={showHintArrow} />;
}
