import type { Color, PieceType } from '../domain/chessTypes';

const letterForType: Record<PieceType, string> = {
  k: 'K',
  q: 'Q',
  r: 'R',
  b: 'B',
  n: 'N',
  p: 'P'
};

const nameForType: Record<PieceType, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn'
};

export type PieceIconProps = {
  color: Color;
  type: PieceType;
  className?: string;
  /** If true, sets aria-hidden and removes the aria-label. */
  ariaHidden?: boolean;
};

/**
 * Simple, platform-consistent piece icon.
 * Avoids platform-specific Unicode chess glyph rendering differences (notably on iOS).
 */
export function PieceIcon({ color, type, className, ariaHidden }: PieceIconProps) {
  const isWhite = color === 'w';
  const fill = isWhite ? '#F9FAFB' : '#111827';
  const stroke = isWhite ? '#111827' : '#F9FAFB';
  const textFill = stroke;

  const ariaLabel = `${isWhite ? 'White' : 'Black'} ${nameForType[type]}`;

  return (
    <svg
      viewBox="0 0 100 100"
      width="1em"
      height="1em"
      className={className}
      role="img"
      aria-label={ariaHidden ? undefined : ariaLabel}
      aria-hidden={ariaHidden ? 'true' : undefined}
      focusable="false"
      style={{ display: 'block' }}
    >
      <circle cx="50" cy="50" r="42" fill={fill} stroke={stroke} strokeWidth="6" />
      <text
        x="50"
        y="54"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="52"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        fill={textFill}
      >
        {letterForType[type]}
      </text>
    </svg>
  );
}
