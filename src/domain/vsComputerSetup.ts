import type { Color } from './chessTypes';
import type { Orientation, TimeControl } from './localSetup';
import type { AiDifficulty } from './ai/types';

export type SideChoice = Color | 'r'; // 'r' = random

export type AiDifficultyPreset = AiDifficulty;

export type VsComputerSetup = {
  side: SideChoice;
  difficulty: AiDifficultyPreset;
  timeControl: TimeControl;
  orientation: Orientation;
};

export function parseSideChoiceParam(param: string | null): SideChoice | null {
  if (param === 'w' || param === 'b' || param === 'r') return param;
  return null;
}

export function formatSideChoice(side: SideChoice): string {
  if (side === 'w') return 'White';
  if (side === 'b') return 'Black';
  return 'Random';
}

export function parseDifficultyParam(param: string | null): AiDifficultyPreset | null {
  if (param === 'easy' || param === 'medium' || param === 'hard' || param === 'custom') return param;
  return null;
}

export function formatDifficulty(d: AiDifficultyPreset): string {
  if (d === 'easy') return 'Easy';
  if (d === 'medium') return 'Medium';
  if (d === 'hard') return 'Hard';
  return 'Custom';
}

export function defaultOrientationForSideChoice(side: SideChoice): Orientation {
  // If the player chooses Black, it's common to orient Black at bottom.
  // If Random, default to White-at-bottom.
  return side === 'b' ? 'b' : 'w';
}
