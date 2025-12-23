export type Orientation = 'w' | 'b';

export type TimeControl =
  | { kind: 'none' }
  | { kind: 'fischer'; initialSeconds: number; incrementSeconds: number };

export type LocalGameSetup = {
  timeControl: TimeControl;
  orientation: Orientation;
};

export const TIME_CONTROL_PRESETS: Array<{ id: string; label: string; value: TimeControl }> = [
  { id: 'none', label: 'No clock', value: { kind: 'none' } },
  { id: '5+0', label: '5+0', value: { kind: 'fischer', initialSeconds: 5 * 60, incrementSeconds: 0 } },
  { id: '3+2', label: '3+2', value: { kind: 'fischer', initialSeconds: 3 * 60, incrementSeconds: 2 } },
  { id: '10+5', label: '10+5', value: { kind: 'fischer', initialSeconds: 10 * 60, incrementSeconds: 5 } }
];

export function formatTimeControl(tc: TimeControl): string {
  if (tc.kind === 'none') return 'No clock';
  const mins = Math.round(tc.initialSeconds / 60);
  return `${mins}+${tc.incrementSeconds}`;
}

// URL param encoding
export function serializeTimeControlParam(tc: TimeControl): string {
  if (tc.kind === 'none') return 'none';
  const mins = Math.round(tc.initialSeconds / 60);
  return `${mins}+${tc.incrementSeconds}`;
}

export function parseTimeControlParam(param: string | null): TimeControl | null {
  if (!param) return null;
  if (param === 'none') return { kind: 'none' };
  const match = /^([0-9]+)\+([0-9]+)$/.exec(param);
  if (!match) return null;
  const mins = Number(match[1]);
  const inc = Number(match[2]);
  if (!Number.isFinite(mins) || !Number.isFinite(inc) || mins < 0 || inc < 0) return null;
  return { kind: 'fischer', initialSeconds: mins * 60, incrementSeconds: inc };
}

export function parseOrientationParam(param: string | null): Orientation | null {
  if (param === 'w' || param === 'b') return param;
  return null;
}

export function formatOrientation(o: Orientation): string {
  return o === 'w' ? 'White at bottom' : 'Black at bottom';
}

export const DEFAULT_LOCAL_SETUP: LocalGameSetup = {
  timeControl: TIME_CONTROL_PRESETS[0].value,
  orientation: 'w'
};
