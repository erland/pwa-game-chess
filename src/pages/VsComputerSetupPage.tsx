import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DEFAULT_LOCAL_SETUP,
  TIME_CONTROL_PRESETS,
  parseOrientationParam,
  parseTimeControlParam,
  type Orientation,
  type TimeControl,
  serializeTimeControlParam
} from '../domain/localSetup';
import {
  defaultOrientationForSideChoice,
  formatDifficulty,
  formatSideChoice,
  parseDifficultyParam,
  parseSideChoiceParam,
  type AiDifficultyPreset,
  type SideChoice
} from '../domain/vsComputerSetup';

const STORAGE_KEY = 'pwa-chess.vsComputerSetup.v1';

type StoredVsSetup = {
  side?: string;
  d?: string;
  tc?: string;
  o?: string;
  tt?: number;
  rn?: number;
  md?: number;
};

function presetIdForTimeControl(tc: TimeControl): string {
  const match = TIME_CONTROL_PRESETS.find((p) => JSON.stringify(p.value) === JSON.stringify(tc));
  return match?.id ?? TIME_CONTROL_PRESETS[0].id;
}

export function VsComputerSetupPage() {
  const navigate = useNavigate();

  // Defaults (v1-compatible)
  const [side, setSide] = useState<SideChoice>('w');
  const [difficulty, setDifficulty] = useState<AiDifficultyPreset>('easy');
  const [timeControl, setTimeControl] = useState<TimeControl>(DEFAULT_LOCAL_SETUP.timeControl);
  const [orientation, setOrientation] = useState<Orientation>('w');

  // Custom tuning
  const [customThinkTimeMs, setCustomThinkTimeMs] = useState<number>(300);
  const [customRandomness, setCustomRandomness] = useState<number>(0.25);
  const [customMaxDepth, setCustomMaxDepth] = useState<number>(3);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const [orientationDirty, setOrientationDirty] = useState(false);

  // Restore last-used settings (optional per plan, but helpful).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: StoredVsSetup = JSON.parse(raw);

      const parsedSide = parseSideChoiceParam(parsed.side ?? null);
      const parsedDifficulty = parseDifficultyParam(parsed.d ?? null);
      const parsedTc = parseTimeControlParam(parsed.tc ?? null);
      const parsedO = parseOrientationParam(parsed.o ?? null);

      if (parsedSide) setSide(parsedSide);
      if (parsedDifficulty) setDifficulty(parsedDifficulty);

      if (parsedTc) setTimeControl(parsedTc);
      if (parsedO) {
        setOrientation(parsedO);
        setOrientationDirty(true);
      } else if (parsedSide) {
        // If we restored side but not explicit orientation, follow default orientation.
        setOrientation(defaultOrientationForSideChoice(parsedSide));
      }

      if (typeof parsed.tt === 'number' && Number.isFinite(parsed.tt)) setCustomThinkTimeMs(clampInt(parsed.tt, 10, 10_000));
      if (typeof parsed.rn === 'number' && Number.isFinite(parsed.rn)) setCustomRandomness(clampFloat(parsed.rn, 0, 1));
      if (typeof parsed.md === 'number' && Number.isFinite(parsed.md)) setCustomMaxDepth(clampInt(parsed.md, 1, 6));

      // If they previously used custom, show advanced by default.
      if (parsedDifficulty === 'custom') setShowAdvanced(true);
    } catch {
      // ignore
    }
  }, []);

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

    if (difficulty === 'custom') {
      params.set('tt', String(clampInt(customThinkTimeMs, 10, 10_000)));
      params.set('rn', String(clampFloat(customRandomness, 0, 1)));
      params.set('md', String(clampInt(customMaxDepth, 1, 6)));
    }

    // Persist last used setup (optional per plan).
    const toStore: StoredVsSetup = {
      side,
      d: difficulty,
      tc: serializeTimeControlParam(timeControl),
      o: orientation,
      tt: difficulty === 'custom' ? clampInt(customThinkTimeMs, 10, 10_000) : undefined,
      rn: difficulty === 'custom' ? clampFloat(customRandomness, 0, 1) : undefined,
      md: difficulty === 'custom' ? clampInt(customMaxDepth, 1, 6) : undefined
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch {
      // ignore
    }

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
              {(['w', 'b', 'r'] as const).map((c) => (
                <label key={c} className="radioItem">
                  <input type="radio" name="side" value={c} checked={side === c} onChange={() => setSideAndMaybeOrientation(c)} />
                  <span>{formatSideChoice(c)}</span>
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
                    onChange={() => {
                      setDifficulty(d);
                      if (d === 'custom') setShowAdvanced(true);
                    }}
                  />
                  <span>{formatDifficulty(d)}</span>
                </label>
              ))}
            </div>

            {difficulty !== 'custom' && (
              <p className="muted" style={{ marginTop: 8 }}>
                Presets control how long the computer thinks and how “risky” its choices are. Choose <strong>Custom</strong> for
                advanced tuning.
              </p>
            )}

            {difficulty === 'custom' && (
              <div className="stack" style={{ marginTop: 12 }}>
                <label className="radioItem" style={{ alignItems: 'center' }}>
                  <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.currentTarget.checked)} />
                  <span>Advanced settings</span>
                </label>

                {showAdvanced && (
                  <div className="stack" style={{ gap: 10 }}>
                    <div className="stack" style={{ gap: 6 }}>
                      <label>
                        Think time: <strong>{clampInt(customThinkTimeMs, 10, 10_000)} ms</strong>
                      </label>
                      <input
                        type="range"
                        min={50}
                        max={1200}
                        step={25}
                        value={customThinkTimeMs}
                        onChange={(e) => setCustomThinkTimeMs(Number(e.currentTarget.value))}
                      />
                      <p className="muted" style={{ marginTop: 0 }}>
                        Higher values make the computer wait longer (and can improve move quality on harder configs).
                      </p>
                    </div>

                    <div className="stack" style={{ gap: 6 }}>
                      <label>
                        Randomness: <strong>{Math.round(clampFloat(customRandomness, 0, 1) * 100)}%</strong>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round(customRandomness * 100)}
                        onChange={(e) => setCustomRandomness(Number(e.currentTarget.value) / 100)}
                      />
                      <p className="muted" style={{ marginTop: 0 }}>
                        Higher randomness makes the computer explore more and play less “optimal”.
                      </p>
                    </div>

                    <div className="stack" style={{ gap: 6 }}>
                      <label>
                        Search depth: <strong>{clampInt(customMaxDepth, 1, 6)}</strong>
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={6}
                        step={1}
                        value={clampInt(customMaxDepth, 1, 6)}
                        onChange={(e) => setCustomMaxDepth(Number(e.currentTarget.value))}
                      />
                      <p className="muted" style={{ marginTop: 0 }}>
                        Higher depth can make the computer stronger, but costs more CPU time. Prefer using a higher think time too.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
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
              {(['w', 'b'] as const).map((o) => (
                <label key={o} className="radioItem">
                  <input
                    type="radio"
                    name="orientation"
                    value={o}
                    checked={orientation === o}
                    onChange={() => {
                      setOrientation(o);
                      setOrientationDirty(true);
                    }}
                  />
                  <span>{o === 'w' ? 'White at bottom' : 'Black at bottom'}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="actions">
            <button className="btn btn-primary" type="submit">
              Start game
            </button>
            <Link className="btn btn-secondary" to="/">
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

function clampInt(v: number, min: number, max: number): number {
  const n = Math.round(v);
  return Math.min(max, Math.max(min, n));
}

function clampFloat(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}
