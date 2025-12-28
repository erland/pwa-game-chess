import type { GameState, Move, Piece } from './chessTypes';

function cloneMove(m: Move): Move {
  return {
    from: m.from,
    to: m.to,
    promotion: m.promotion,
    isCastle: m.isCastle,
    castleSide: m.castleSide,
    isEnPassant: m.isEnPassant,
    captured: m.captured ? ({ ...m.captured } as Piece) : m.captured
  };
}

/**
 * Create a deep-ish clone of a GameState for safe mutation-free checkpointing.
 *
 * GameState is designed to be JSON-serializable and immutable-by-convention,
 * but checkpoints must never share array references.
 */
export function cloneGameState(s: GameState): GameState {
  return {
    board: s.board.map((p) => (p ? { ...p } : null)),
    sideToMove: s.sideToMove,
    castling: { ...s.castling },
    enPassantTarget: s.enPassantTarget,
    halfmoveClock: s.halfmoveClock,
    fullmoveNumber: s.fullmoveNumber,
    history: s.history.map(cloneMove),
    forcedStatus: s.forcedStatus ? ({ ...s.forcedStatus } as any) : null
  };
}
