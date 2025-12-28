import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { HighlightTheme, TrainingSettings } from '../../storage/training/trainingSettingsStore';
import { DEFAULT_TRAINING_SETTINGS, loadTrainingSettings, saveTrainingSettings } from '../../storage/training/trainingSettingsStore';

type TrainingSettingsContextValue = {
  settings: TrainingSettings;
  setSettings: (next: TrainingSettings) => void;
  updateSettings: (patch: Partial<TrainingSettings>) => void;
};

const Ctx = createContext<TrainingSettingsContextValue | null>(null);

function themeClass(theme: HighlightTheme): string {
  if (theme === 'highContrast') return 'hl-highContrast';
  if (theme === 'colorBlindSafe') return 'hl-colorBlindSafe';
  return 'hl-default';
}

export function TrainingSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<TrainingSettings>(() => loadTrainingSettings());

  const setSettings = (next: TrainingSettings) => {
    setSettingsState(next);
    saveTrainingSettings(next);
  };

  const updateSettings = (patch: Partial<TrainingSettings>) => {
    setSettings({ ...settings, ...patch });
  };

  // Apply highlight theme class to <body>. Clean up on unmount.
  useEffect(() => {
    const cls = themeClass(settings.highlightTheme);
    if (typeof document === 'undefined') return;

    const body = document.body;
    const all = ['hl-default', 'hl-highContrast', 'hl-colorBlindSafe'];
    for (const c of all) body.classList.remove(c);
    body.classList.add(cls);

    return () => {
      body.classList.remove(cls);
    };
  }, [settings.highlightTheme]);

  const value = useMemo(() => ({ settings, setSettings, updateSettings }), [settings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTrainingSettings(): TrainingSettingsContextValue {
  const v = useContext(Ctx);
  if (!v) {
    // Provide a helpful default to avoid crashing if used outside provider.
    return {
      settings: DEFAULT_TRAINING_SETTINGS,
      setSettings: () => {},
      updateSettings: () => {},
    };
  }
  return v;
}
