import { useTrainingSettings } from './TrainingSettingsContext';

function RadioRow({
  name,
  value,
  checked,
  label,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  label: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="row" style={{ gap: 10, alignItems: 'center' }}>
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} />
      <span>{label}</span>
    </label>
  );
}

export function TrainingSettingsPage() {
  const { settings, updateSettings } = useTrainingSettings();

  return (
    <section className="stack">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Settings</h3>
        <p className="muted" style={{ marginTop: 6 }}>
          These preferences affect training pages. More settings will be added in later steps.
        </p>
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>Highlight theme</h4>
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }} aria-label="Highlight theme">
          <div className="stack" style={{ gap: 8 }}>
            <RadioRow
              name="highlightTheme"
              value="default"
              checked={settings.highlightTheme === 'default'}
              label="Default"
              onChange={(v) => updateSettings({ highlightTheme: v as any })}
            />
            <RadioRow
              name="highlightTheme"
              value="highContrast"
              checked={settings.highlightTheme === 'highContrast'}
              label="High contrast"
              onChange={(v) => updateSettings({ highlightTheme: v as any })}
            />
            <RadioRow
              name="highlightTheme"
              value="colorBlindSafe"
              checked={settings.highlightTheme === 'colorBlindSafe'}
              label="Color-blind safe"
              onChange={(v) => updateSettings({ highlightTheme: v as any })}
            />
          </div>
        </fieldset>
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>Board orientation</h4>
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }} aria-label="Board orientation">
          <div className="stack" style={{ gap: 8 }}>
            <RadioRow
              name="orientation"
              value="auto"
              checked={settings.orientation === 'auto'}
              label="Auto (based on side to move / trainer)"
              onChange={(v) => updateSettings({ orientation: v as any })}
            />
            <RadioRow
              name="orientation"
              value="w"
              checked={settings.orientation === 'w'}
              label="White at bottom"
              onChange={(v) => updateSettings({ orientation: v as any })}
            />
            <RadioRow
              name="orientation"
              value="b"
              checked={settings.orientation === 'b'}
              label="Black at bottom"
              onChange={(v) => updateSettings({ orientation: v as any })}
            />
          </div>
        </fieldset>
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>Hint style</h4>
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }} aria-label="Hint style">
          <div className="stack" style={{ gap: 8 }}>
            <RadioRow
              name="hintStyle"
              value="squares"
              checked={settings.hintStyle === 'squares'}
              label="Squares"
              onChange={(v) => updateSettings({ hintStyle: v as any })}
            />
            <RadioRow
              name="hintStyle"
              value="arrow"
              checked={settings.hintStyle === 'arrow'}
              label="Arrow"
              onChange={(v) => updateSettings({ hintStyle: v as any })}
            />
            <RadioRow
              name="hintStyle"
              value="both"
              checked={settings.hintStyle === 'both'}
              label="Both"
              onChange={(v) => updateSettings({ hintStyle: v as any })}
            />
          </div>
        </fieldset>

        <p className="muted" style={{ marginTop: 10 }}>
          Arrow hints will be implemented in Step 12.3.
        </p>
      </div>
    </section>
  );
}
