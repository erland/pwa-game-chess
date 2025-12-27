import type { Color, PieceType } from '../domain/chessTypes';

type Props = {
  type: PieceType;
  color: Color;
  size?: number;
  className?: string;
  ariaHidden?: boolean;
  title?: string;
};

/**
 * PNG-based piece icons (cropped from the provided reference image).
 *
 * Files live in /public/pieces and are served from the app base URL.
 * Naming: wP, wN, wB, wR, wQ, wK and bP... etc.
 */
export function PieceIcon(props: Props) {
  const { type, color, size, className, ariaHidden, title } = props;

  // Asset base path.
// You said you deploy AND run locally under /pwa-game-chess/, so we fall back to that
// when Vite's BASE_URL is "/" (e.g. dev server default).
const viteBase: string = (import.meta as any)?.env?.BASE_URL ?? '/';
const baseRaw = (viteBase && viteBase !== '/' ? viteBase : '/pwa-game-chess/');
const base = baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`;
  const file = `${color}${type.toUpperCase()}.png`; // e.g. "wP.png"
  const src = `${base}pieces/${file}`;

  const style = size ? ({ width: size, height: size } as const) : undefined;

  const alt = ariaHidden ? '' : title ?? `${color === 'w' ? 'White' : 'Black'} ${pieceName(type)}`;

  return (
    <img
      src={src}
      className={className}
      style={style}
      alt={alt}
      aria-hidden={ariaHidden ? true : undefined}
      draggable={false}
    />
  );
}

export default PieceIcon;

function pieceName(type: PieceType) {
  switch (type) {
    case 'p':
      return 'pawn';
    case 'n':
      return 'knight';
    case 'b':
      return 'bishop';
    case 'r':
      return 'rook';
    case 'q':
      return 'queen';
    case 'k':
      return 'king';
  }
}
