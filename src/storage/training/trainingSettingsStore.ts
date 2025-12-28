export type HighlightTheme = 'default' | 'highContrast' | 'colorBlindSafe';
export type HintStyle = 'squares' | 'arrow' | 'both';
export type OrientationSetting = 'auto' | 'w' | 'b';

export interface TrainingSettings {
  highlightTheme: HighlightTheme;
  hintStyle: HintStyle;
  orientation: OrientationSetting;
}

const STORAGE_KEY = 'pwa-game-chess.training.settings.v1';

export const DEFAULT_TRAINING_SETTINGS: TrainingSettings = {
  highlightTheme: 'default',
  hintStyle: 'squares',
  orientation: 'auto',
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

export function loadTrainingSettings(): TrainingSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_TRAINING_SETTINGS;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TRAINING_SETTINGS;

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return DEFAULT_TRAINING_SETTINGS;

    const highlightTheme = parsed.highlightTheme;
    const hintStyle = parsed.hintStyle;
    const orientation = parsed.orientation;

    return {
      highlightTheme:
        highlightTheme === 'highContrast' || highlightTheme === 'colorBlindSafe' || highlightTheme === 'default'
          ? highlightTheme
          : DEFAULT_TRAINING_SETTINGS.highlightTheme,
      hintStyle: hintStyle === 'arrow' || hintStyle === 'both' || hintStyle === 'squares' ? hintStyle : DEFAULT_TRAINING_SETTINGS.hintStyle,
      orientation: orientation === 'w' || orientation === 'b' || orientation === 'auto' ? orientation : DEFAULT_TRAINING_SETTINGS.orientation,
    };
  } catch {
    return DEFAULT_TRAINING_SETTINGS;
  }
}

export function saveTrainingSettings(settings: TrainingSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
