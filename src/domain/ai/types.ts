import type { Color, GameState, Move } from '../chessTypes';

/**
 * v2: AI boundary types.
 *
 * Keep these types UI-agnostic and JSON-serializable so they can cross a Web Worker boundary.
 */

export type AiDifficulty = 'easy' | 'medium' | 'hard' | 'custom';

export type AiConfig = {
  difficulty: AiDifficulty;

  /** Target thinking time. Engines/adapters may treat this as a budget (ms). */
  thinkTimeMs?: number;
  /** Optional max depth for search-based engines. */
  maxDepth?: number;
  /** 0..1, where higher means more randomness/exploration. */
  randomness?: number;
  /** Optional seed to make choices reproducible in tests. */
  seed?: number;
};

export type AiMoveRequest = {
  /**
   * Snapshot of game state at the time the move was requested.
   * AI must treat this as immutable.
   */
  state: GameState;
  /** Which side the AI is playing for this request. */
  aiColor: Color;
  /** Configuration for difficulty / limits. */
  config: AiConfig;
  /** Optional request id for tracing/debugging. */
  requestId?: string;
};

export type AiMoveMetadata = {
  timeMs?: number;
  depth?: number;
  nodes?: number;
  scoreCp?: number;
  mateIn?: number;
  pv?: string[];
};

export type AiMoveResult = {
  move: Move;
  meta?: AiMoveMetadata;
};

export interface ChessAi {
  init?(): Promise<void>;
  /**
   * Compute a move for the provided snapshot.
   *
   * The AbortSignal MUST be observed by implementations so callers can cancel work.
   */
  getMove(request: AiMoveRequest, signal: AbortSignal): Promise<AiMoveResult>;
  dispose?(): Promise<void>;
}
