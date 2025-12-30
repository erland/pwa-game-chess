import type { Color, GameState, Move, Square } from '../../chessTypes';
import type { Orientation } from '../../localSetup';

import type { TrainingItemKey } from '../keys';
import type { OpeningLineItem, TrainingPack } from '../schema';
import type { OpeningNodeRef } from '../openingNodes';

export type DrillMode = 'nodes' | 'line';

export type OpeningRef = {
  key: TrainingItemKey;
  packId: string;
  packTitle: string;
  item: OpeningLineItem;
  lineUci: string[];
};

export type OpeningsSessionState = {
  mode: DrillMode;
  drillColor: Color;
  orientation: Orientation;

  current: OpeningRef | null;
  currentNode: OpeningNodeRef | null;

  initialFen: string | null;
  state: GameState | null;
  /** Index into lineUci for line mode, or plyIndex (start) for node mode. */
  index: number;

  running: boolean;
  resultMsg: string | null;
  showHintFlag: boolean;
  startedAtMs: number;
};

export type OpeningsSessionEffect =
  | { kind: 'RECORD_LINE_ATTEMPT'; packId: string; itemId: string; success: boolean; solveMs: number }
  | {
      kind: 'RECORD_NODE_ATTEMPT';
      key: string;
      packId: string;
      itemId: string;
      plyIndex: number;
      success: boolean;
      solveMs: number;
    };

export type OpeningsSessionAction =
  | { type: 'SET_MODE'; mode: DrillMode }
  | { type: 'SET_DRILL_COLOR'; color: Color }
  | { type: 'SET_RESULT_MSG'; message: string | null }
  | { type: 'START_LINE'; ref: OpeningRef; nowMs: number }
  | { type: 'START_NODE'; node: OpeningNodeRef; nowMs: number }
  | { type: 'RESET_TO_INITIAL'; nowMs: number }
  | { type: 'APPLY_MOVE'; move: Move; nowMs: number }
  | { type: 'STOP_SESSION' }
  | { type: 'BACK_TO_LIST' }
  | { type: 'TOGGLE_HINT' }
  | { type: 'SHOW_HINT' };

export type OpeningsPacksSummary = {
  refs: OpeningRef[];
  warnings: string[];
  packs: TrainingPack[];
};

export type HintMove = { from: Square; to: Square };
