import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DEFAULT_LOCAL_SETUP,
  TIME_CONTROL_PRESETS,
  type Orientation,
  type TimeControl,
  serializeTimeControlParam
} from '../domain/localSetup';

function sameTimeControl(a: TimeControl, b: TimeControl): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'none') return true;

  // At this point `a` is fischer; narrow `b` too (TS doesn't infer the correlation from a.kind !== b.kind).
  if (b.kind === 'none') return false;

  return a.initialSeconds === b.initialSeconds && a.incrementSeconds === b.incrementSeconds;
}

export function LocalSetupPage() {
  const navigate = useNavigate();
  const [timeControl, setTimeControl] = useState<TimeControl>(DEFAULT_LOCAL_SETUP.timeControl);
  const [orientation, setOrientation] = useState<Orientation>(DEFAULT_LOCAL_SETUP.orientation);

  const selectedPresetId = useMemo(() => {
    return TIME_CONTROL_PRESETS.find((p) => sameTimeControl(p.value, timeControl))?.id ?? 'none';
  }, [timeControl]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();

    const params = new URLSearchParams();
    params.set('tc', serializeTimeControlParam(timeControl));
    params.set('o', orientation);

    navigate(`/local/game?${params.toString()}`);
  }

  return (
    <section className="stack">
      <div className="card">
        <h2>Local setup</h2>
        <p className="muted">Choose a time control and board orientation, then start a new game.</p>

        <form onSubmit={onSubmit} className="stack">
          <fieldset className="fieldset">
            <legend>Time control</legend>
            <div className="radioGrid">
              {TIME_CONTROL_PRESETS.map((preset) => (
                <label key={preset.id} className="radioItem">
                  <input
                    type="radio"
                    name="timeControl"
                    value={preset.id}
                    checked={selectedPresetId === preset.id}
                    onChange={() => setTimeControl(preset.value)}
                  />
                  <span>{preset.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="fieldset">
            <legend>Orientation</legend>
            <div className="radioGrid">
              <label className="radioItem">
                <input
                  type="radio"
                  name="orientation"
                  value="w"
                  checked={orientation === 'w'}
                  onChange={() => setOrientation('w')}
                />
                <span>White at bottom</span>
              </label>
              <label className="radioItem">
                <input
                  type="radio"
                  name="orientation"
                  value="b"
                  checked={orientation === 'b'}
                  onChange={() => setOrientation('b')}
                />
                <span>Black at bottom</span>
              </label>
            </div>
          </fieldset>

          <div className="actions">
            <button type="submit" className="btn btn-primary">
              Start game
            </button>
            <Link to="/" className="btn btn-secondary">
              Cancel
            </Link>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 className="h3">Note</h3>
        <p className="muted">
          In v1 Step 2 we only wire up navigation and the game start flow. The chess rules engine and board UI are built in
          later steps.
        </p>
      </div>
    </section>
  );
}
