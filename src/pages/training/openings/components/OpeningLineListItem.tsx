import { Link } from 'react-router-dom';

import type { OpeningRef } from '../useOpeningsSessionController';
import type { TrainingItemStats } from '../../../../storage/training/trainingStore';

export function OpeningLineListItem(props: {
  refItem: OpeningRef;
  stats?: TrainingItemStats | null;
  onStart: () => void;
}) {
  const { refItem, stats, onStart } = props;
  const themes = (refItem.item.themes ?? []).join(', ') || '—';
  const attempts = stats?.attempts ?? 0;
  const successes = stats?.successes ?? 0;
  const accuracy = attempts > 0 ? Math.round((successes / attempts) * 100) : 0;

  return (
    <li style={{ marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <strong>
            {refItem.packTitle} • {refItem.item.name ?? refItem.item.itemId}
          </strong>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            themes: {themes} • difficulty: {refItem.item.difficulty} • moves: {refItem.lineUci.length}
            {attempts > 0 ? ` • accuracy: ${accuracy}%` : ''}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-secondary" type="button" onClick={onStart}>
            Start
          </button>
          <Link className="btn btn-secondary" to={`/training/openings?focus=${encodeURIComponent(refItem.key)}`}>
            Focus
          </Link>
        </div>
      </div>
    </li>
  );
}
