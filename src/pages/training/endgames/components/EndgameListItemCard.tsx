import type { TrainingItemStats } from '../../../../storage/training/trainingStore';

import type { EndgameRef } from '../useEndgamesSessionController';

export function EndgameListItemCard(props: {
  refItem: EndgameRef;
  stats: TrainingItemStats | undefined;
  onStart: () => void;
}) {
  const { refItem: r, stats, onStart } = props;
  const acc = stats && stats.attempts > 0 ? Math.round((stats.successes / stats.attempts) * 100) : null;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <strong>{r.packId}</strong> · <span className="muted">{r.itemId}</span>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          diff {r.difficulty}
          {acc != null ? ` • ${acc}%` : ''}
        </span>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Goal: <strong>{r.goalText ?? 'Win'}</strong>
      </p>
      <p className="muted" style={{ marginTop: 6 }}>Themes: {r.themes.join(', ')}</p>
      <div className="actions" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={onStart}>
          Start
        </button>
      </div>
    </div>
  );
}
