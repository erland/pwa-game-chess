export type GameMode = 'local' | 'vsComputer';

export function parseGameModeParam(param: string | null): GameMode | null {
  if (param === 'local' || param === 'vsComputer') return param;
  return null;
}

export function formatGameMode(mode: GameMode): string {
  return mode === 'local' ? 'Local' : 'Vs computer';
}
