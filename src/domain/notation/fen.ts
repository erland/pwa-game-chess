import type { GameState, Piece } from '../chessTypes';
import { toAlgebraic } from '../square';

function pieceToFenChar(p: Piece): string {
  const c = p.type;
  return p.color === 'w' ? c.toUpperCase() : c;
}

/** Convert a GameState to a FEN string. */
export function toFEN(state: GameState): string {
  const ranks: string[] = [];

  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    let out = '';
    for (let f = 0; f < 8; f++) {
      const sq = r * 8 + f;
      const p = state.board[sq];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          out += String(empty);
          empty = 0;
        }
        out += pieceToFenChar(p);
      }
    }
    if (empty > 0) out += String(empty);
    ranks.push(out);
  }

  const placement = ranks.join('/');
  const active = state.sideToMove;

  let castling = '';
  if (state.castling.wK) castling += 'K';
  if (state.castling.wQ) castling += 'Q';
  if (state.castling.bK) castling += 'k';
  if (state.castling.bQ) castling += 'q';
  if (castling === '') castling = '-';

  const ep = state.enPassantTarget == null ? '-' : toAlgebraic(state.enPassantTarget);

  return `${placement} ${active} ${castling} ${ep} ${state.halfmoveClock} ${state.fullmoveNumber}`;
}
