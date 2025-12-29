import type { Color } from '../../../../domain/chessTypes';
import type { DrillMode } from '../useOpeningsSessionController';

export function OpeningsIntroCard(props: {
  mode: DrillMode;
  drillColor: Color;
  linesCount: number;
  nodesCount: number;
  learnedNodeCount: number;
  onModeChange: (mode: DrillMode) => void;
  onColorChange: (color: Color) => void;
  onStart: () => void;
}) {
  const { mode, drillColor, linesCount, nodesCount, learnedNodeCount, onModeChange, onColorChange, onStart } = props;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>Drill settings</strong>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Drill color controls orientation + whose moves you must play.
          </div>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <label className="muted" style={{ fontSize: 12 }}>
            Mode:
          </label>
          <select value={mode} onChange={(e) => onModeChange(e.target.value as DrillMode)}>
            <option value="nodes">Nodes (spaced repetition)</option>
            <option value="line">Full line (classic)</option>
          </select>

          <label className="muted" style={{ fontSize: 12 }}>
            Drill as:
          </label>
          <select value={drillColor} onChange={(e) => onColorChange(e.target.value as Color)}>
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>

          <button className="btn btn-primary" type="button" onClick={onStart} disabled={linesCount === 0}>
            Start drill
          </button>
        </div>
      </div>

      {mode === 'nodes' && (
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Nodes available for this color: {nodesCount} • Learned: {learnedNodeCount}
        </div>
      )}
    </div>
  );
}
