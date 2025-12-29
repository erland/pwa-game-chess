import { useSearchParams } from 'react-router-dom';

import { useTrainingSettings } from './TrainingSettingsContext';
import { TrainingOpeningsView } from './openings/TrainingOpeningsView';
import { useOpeningsSessionController } from './openings/useOpeningsSessionController';

export function TrainingOpeningsPage() {
  const { settings } = useTrainingSettings();
  const showHintSquares = settings.hintStyle === 'squares' || settings.hintStyle === 'both';
  const showHintArrow = settings.hintStyle === 'arrow' || settings.hintStyle === 'both';

  const [searchParams] = useSearchParams();
  const focusKey = searchParams.get('focus');
  const focusNodeKey = searchParams.get('focusNode');

  const ctrl = useOpeningsSessionController({ focusKey, focusNodeKey });

  return <TrainingOpeningsView ctrl={ctrl} showHintSquares={showHintSquares} showHintArrow={showHintArrow} />;
}
