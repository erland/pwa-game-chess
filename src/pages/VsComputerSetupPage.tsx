import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DEFAULT_LOCAL_SETUP,
  TIME_CONTROL_PRESETS,
  type Orientation,
  type TimeControl,
  serializeTimeControlParam
} from '../domain/localSetup';
import {
  defaultOrientationForSideChoice,
  formatDifficulty,
  formatSideChoice,
  type AiDifficultyPreset,
  type SideChoice
} from '../domain/vsComputerSetup';

function sameTimeControl(a: TimeControl, b: TimeControl): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'none') return true;

  // At this point `a` is fischer; narrow `b` too.
  if (b.kind === 'none') return false;
  return a.initialSeconds === b.initialSeconds && a.incrementSeconds === b.incrementSeconds;
}

function presetIdForTimeControl(tc: TimeControl): string | null {
  const match = TIME_CONTROL_PRESETS.find((p) => sameTimeControl(p.value, tc));
  return match ? match.id : null;
}

export function VsComputerSetupPage() {
  const navigate = useNavigate();

  // Defaults: mirror local setup defaults for time control and orientation.
  const [timeControl, setTimeControl] = useState<TimeControl>(DEFAULT_LOCAL_SETUP.timeControl);
  const [side, setSide] = useState<SideChoice>('w');
  const [difficulty, setDifficulty] = useState<AiDifficultyPreset>('easy');

  // Orientation defaults to the chosen side (white-bottom if player is white), unless the user overrides it.
  const [orientation, setOrientation] = useState<Orientation>(defaultOrientationForSideChoice(side));
  const [orientationDirty, setOrientationDirty] = useState(false);

  const selectedPresetId = useMemo(() => presetIdForTimeControl(timeControl), [timeControl]);

  function setSideAndMaybeOrientation(next: SideChoice) {
    setSide(next);
    if (!orientationDirty) setOrientation(defaultOrientationForSideChoice(next));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();

    const params = new URLSearchParams();
    params.set('m', 'vsComputer');
    params.set('side', side);
    params.set('d', difficulty);
    params.set('tc', serializeTimeControlParam(timeControl));
    params.set('o', orientation);

    navigate(`/vs-computer/game?${params.toString()}`);
  }

  return (
    <section className="stack">
      <div className="card">
        <h2>Vs computer setup</h2>
        <p className="muted">Choose side, difficulty, time control, and orientation, then start a new game.</p>

        <form onSubmit={onSubmit} className="stack">
          <fieldset className="fieldset">
            <legend>Side</legend>
            <div className="radioGrid">
              {(['w', 'b', 'r'] as const).map((s) => (
                <label key={s} className="radioItem">
                  <input
                    type="radio"
                    name="side"
                    value={s}
                    checked={side === s}
                    onChange={() => setSideAndMaybeOrientation(s)}
                  />
                  <span>{formatSideChoice(s)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="fieldset">
            <legend>Difficulty</legend>
            <div className="radioGrid">
              {(['easy', 'medium', 'hard', 'custom'] as const).map((d) => (
                <label key={d} className="radioItem">
                  <input
                    type="radio"
                    name="difficulty"
                    value={d}
                    checked={difficulty === d}
                    onChange={() => setDifficulty(d)}
                  />
                  <span>{formatDifficulty(d)}</span>
                </label>
              ))}
            </div>
          </fieldset>

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
                  onChange={() => {
                    setOrientation('w');
                    setOrientationDirty(true);
                  }}
                />
                <span>White at bottom</span>
              </label>
              <label className="radioItem">
                <input
                  type="radio"
                  name="orientation"
                  value="b"
                  checked={orientation === 'b'}
                  onChange={() => {
                    setOrientation('b');
                    setOrientationDirty(true);
                  }}
                />
                <span>Black at bottom</span>
              </label>
            </div>
            {!orientationDirty && (
              <p className="muted" style={{ marginTop: 8 }}>
                Orientation follows your chosen side. Change it here to override.
              </p>
            )}
          </fieldset>

          <div className="actions">
            <button type="submit" className="btn btn-primary">
              Start game
            </button>
            <Link to="/" className="btn">
              Cancel
            </Link>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 className="h3">Note</h3>
        <p className="muted">
          This version uses a simple built-in bot (no external engine). Later v2 steps can make the AI stronger and/or
          move it into a Web Worker.
        </p>
      </div>
    </section>
  );
}
