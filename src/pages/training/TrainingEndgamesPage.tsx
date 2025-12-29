import { useSearchParams } from 'react-router-dom';

import { useTrainingSettings } from './TrainingSettingsContext';
import { TrainingEndgamesView } from './endgames/TrainingEndgamesView';
import { useEndgamesSessionController } from './endgames/useEndgamesSessionController';

export function TrainingEndgamesPage() {
  const { settings } = useTrainingSettings();
  const showHintSquares = settings.hintStyle === 'squares' || settings.hintStyle === 'both';
  const showHintArrow = settings.hintStyle === 'arrow' || settings.hintStyle === 'both';

  const [searchParams] = useSearchParams();
  const focusKey = searchParams.get('focus');

  const ctrl = useEndgamesSessionController({ focusKey });

  return <TrainingEndgamesView ctrl={ctrl} showHintSquares={showHintSquares} showHintArrow={showHintArrow} />;
}
