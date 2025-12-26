import type { GameState, Move } from '../chessTypes';
import { createInitialGameState } from '../gameState';
import { generateLegalMoves } from '../legalMoves';
import { applyMove } from '../applyMove';
import type { GameRecord, MoveRecord } from '../recording/types';

export type ReplayError = {
  /** Ply index (1-based for moves; 0 is initial position). */
  ply: number;
  move: MoveRecord;
  reason: string;
};

export type ReplayFrame = {
  /** Ply index: 0 = initial position, 1 = after first move, ... */
  ply: number;
  /** State after applying moves up to `ply`. */
  state: GameState;
  /** The move that produced this frame (undefined for ply 0). */
  move?: Move;
};

export type ReplayResult = {
  record: GameRecord;
  frames: ReplayFrame[];
  errors: ReplayError[];
  /** True when all moves were replayed successfully. */
  ok: boolean;
};

/**
 * Deterministically replay a persisted GameRecord into a sequence of GameStates.
 *
 * Design goals:
 * - Pure & deterministic: the same record yields the same frames.
 * - Defensive: can validate that persisted moves are legal from each position.
 * - Future-friendly: can later support FEN starts; currently starts from standard initial.
 */
export function replayGameRecord(
  record: GameRecord,
  opts?: {
    /** If true (default), validate moves by matching them against generateLegalMoves at each ply. */
    validateLegal?: boolean;
    /** If true, stop at first error (default true). */
    stopOnError?: boolean;
  }
): ReplayResult {
  const validateLegal = opts?.validateLegal ?? true;
  const stopOnError = opts?.stopOnError ?? true;

  // v3: we only record standard games. Keep a clear error for future FEN support.
  if (record.initialFen) {
    return {
      record,
      frames: [{ ply: 0, state: createInitialGameState() }],
      errors: [
        {
          ply: 0,
          move: record.moves[0] ?? ({ from: 0, to: 0 } as MoveRecord),
          reason: 'FEN starts are not supported yet'
        }
      ],
      ok: false
    };
  }

  const frames: ReplayFrame[] = [];
  const errors: ReplayError[] = [];

  let state: GameState = createInitialGameState();
  frames.push({ ply: 0, state });

  for (let i = 0; i < record.moves.length; i++) {
    const mr = record.moves[i];
    const ply = i + 1;

    const candidate: Move = { from: mr.from, to: mr.to, promotion: mr.promotion };

    let moveToApply: Move = candidate;

    if (validateLegal) {
      const legal = generateLegalMoves(state);
      const match = legal.find(
        (m) => m.from === candidate.from && m.to === candidate.to && m.promotion === candidate.promotion
      );
      if (!match) {
        errors.push({
          ply,
          move: mr,
          reason: 'Recorded move is not legal from the reconstructed position'
        });
        if (stopOnError) break;
        // Try to apply anyway (applyMove is defensive); keep deterministic progression if possible.
        moveToApply = candidate;
      } else {
        moveToApply = match;
      }
    }

    const next = applyMove(state, moveToApply);

    // applyMove is defensive and may return the same object when it rejects a move.
    if (next === state) {
      errors.push({
        ply,
        move: mr,
        reason: 'Move application failed (applyMove rejected the move)'
      });
      if (stopOnError) break;
    }

    state = next;
    frames.push({ ply, state, move: moveToApply });
  }

  return { record, frames, errors, ok: errors.length === 0 && frames.length === record.moves.length + 1 };
}

/** Helper to read a frame safely (clamps to [0, lastPly]). */
export function getReplayStateAtPly(result: ReplayResult, ply: number): GameState {
  const clamped = Math.max(0, Math.min(ply, result.frames.length - 1));
  return result.frames[clamped].state;
}