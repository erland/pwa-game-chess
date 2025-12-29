import { useSearchParams } from 'react-router-dom';

import { useTrainingSettings } from './TrainingSettingsContext';
import { TrainingTacticsView } from './tactics/TrainingTacticsView';
import { useTacticsSessionController } from './tactics/useTacticsSessionController';

export function TrainingTacticsPage() {
  const { settings } = useTrainingSettings();
  const showHintSquares = settings.hintStyle === 'squares' || settings.hintStyle === 'both';
  const showHintArrow = settings.hintStyle === 'arrow' || settings.hintStyle === 'both';

  const [searchParams] = useSearchParams();
  const reviewSessionId = searchParams.get('reviewSession');
  const focusKey = searchParams.get('focus');

  const ctrl = useTacticsSessionController({ reviewSessionId, focusKey });

  return <TrainingTacticsView ctrl={ctrl} showHintSquares={showHintSquares} showHintArrow={showHintArrow} />;
}
