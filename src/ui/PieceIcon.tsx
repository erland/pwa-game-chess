import { useId } from 'react';
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
 * Glossy, platform-consistent SVG chess pieces (no Unicode glyphs).
 * Uses simple, original silhouettes + gradients so iOS renders consistently.
 */
export function PieceIcon({ type, color, size = 28, className, ariaHidden, title }: Props) {
  const uid = useId();
  const isWhite = color === 'w';

  const stroke = isWhite ? '#5b5b5b' : '#cfcfcf';
  const highlightStroke = isWhite ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.18)';

  const mainTop = isWhite ? '#ffffff' : '#4b4b4b';
  const mainMid = isWhite ? '#f1f1f1' : '#2a2a2a';
  const mainBot = isWhite ? '#d6d6d6' : '#0e0e0e';

  const baseTop = isWhite ? '#fafafa' : '#3a3a3a';
  const baseBot = isWhite ? '#cfcfcf' : '#0a0a0a';

  const gMain = uid + '-main';
  const gBase = uid + '-base';

  const fillMain = 'url(#' + gMain + ')';
  const fillBase = 'url(#' + gBase + ')';

  function Base() {
    return (
      <>
        {/* Shadow */}
        <ellipse cx="50" cy="91" rx="24" ry="6" fill="rgba(0,0,0,0.18)" />
        {/* Base plate */}
        <path
          d="M24 86c0-4 3-7 7-7h38c4 0 7 3 7 7v4c0 3-2 5-5 5H29c-3 0-5-2-5-5v-4z"
          fill={fillBase}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Base ridge */}
        <path
          d="M30 80h40c2 0 4 2 4 4v1H26v-1c0-2 2-4 4-4z"
          fill={fillMain}
          stroke={stroke}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {/* Shine */}
        <path d="M30 86c2-3 7-5 12-5" fill="none" stroke={highlightStroke} strokeWidth="3" strokeLinecap="round" />
      </>
    );
  }

  function Pawn() {
    return (
      <>
        <Base />
        <circle cx="50" cy="32" r="10.5" fill={fillMain} stroke={stroke} strokeWidth="1.5" />
        <path d="M41 43h18" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M38 78c0-12 4-20 12-27 8 7 12 15 12 27H38z" fill={fillMain} stroke={stroke} strokeWidth="1.5" />
        <path d="M43 56c5-8 14-8 18 0" fill="none" stroke={highlightStroke} strokeWidth="3" strokeLinecap="round" />
      </>
    );
  }

  function Rook() {
    return (
      <>
        <Base />
        <path
          d="M34 78V46c0-3 2-5 5-5h22c3 0 5 2 5 5v32H34z"
          fill={fillMain}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M34 46h32v-10h-7v6h-6v-6h-6v6h-6v-6h-7v10z"
          fill={fillMain}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M40 60c6-10 18-10 22 0" fill="none" stroke={highlightStroke} strokeWidth="3" strokeLinecap="round" />
      </>
    );
  }

  function Bishop() {
    return (
      <>
        <Base />
        <path
          d="M50 22c9 0 16 10 16 20 0 9-7 15-16 15s-16-6-16-15c0-10 7-20 16-20z"
          fill={fillMain}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M56 26c-5 8-5 16 0 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        <path d="M38 78c0-10 4-17 12-22 8 5 12 12 12 22H38z" fill={fillMain} stroke={stroke} strokeWidth="1.5" />
        <path d="M42 52c6-8 12-8 16 0" fill="none" stroke={highlightStroke} strokeWidth="3" strokeLinecap="round" />
      </>
    );
  }

  function Knight() {
    return (
      <>
        <Base />
        <path
          d="M36 78c0-14 6-23 14-29 8-6 9-12 8-18 10 5 16 14 15 24-1 7-6 12-11 16 2 4 3 7 3 7H36z"
          fill={fillMain}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="60" cy="44" r="2.6" fill={stroke} />
        <path d="M46 48c8-2 12 2 16 8" fill="none" stroke={highlightStroke} strokeWidth="3" strokeLinecap="round" />
      </>
    );
  }

  function Queen() {
    return (
      <>
        <Base />
        <path
          d="M34 78l4-30 9 10 3-16 3 16 9-10 4 30H34z"
          fill={fillMain}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="38" cy="44" r="3" fill={fillMain} stroke={stroke} strokeWidth="1.2" />
        <circle cx="50" cy="38" r="3.2" fill={fillMain} stroke={stroke} strokeWidth="1.2" />
        <circle cx="62" cy="44" r="3" fill={fillMain} stroke={stroke} strokeWidth="1.2" />
        <path d="M41 60c6-10 12-10 18 0" fill="none" stroke={highlightStroke} strokeWidth="3" strokeLinecap="round" />
      </>
    );
  }

  function King() {
    return (
      <>
        <Base />
        <path
          d="M38 78c0-15 7-24 12-30 5 6 12 15 12 30H38z"
          fill={fillMain}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Crown */}
        <path
          d="M40 48l4-14 6 8 6-8 4 14H40z"
          fill={fillMain}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Cross */}
        <path d="M50 22v14" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M44 28h12" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M42 58c6-9 14-9 16 0" fill="none" stroke={highlightStroke} strokeWidth="3" strokeLinecap="round" />
      </>
    );
  }

  function Piece() {
    switch (type) {
      case 'p':
        return <Pawn />;
      case 'r':
        return <Rook />;
      case 'n':
        return <Knight />;
      case 'b':
        return <Bishop />;
      case 'q':
        return <Queen />;
      case 'k':
        return <King />;
      default:
        return <Pawn />;
    }
  }

  const ariaLabel = ariaHidden ? undefined : title ? title : (isWhite ? 'White ' : 'Black ') + type.toUpperCase();

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={ariaHidden ? undefined : 'img'}
      aria-hidden={ariaHidden ? true : undefined}
      aria-label={ariaLabel}
      focusable="false"
    >
      <defs>
        <linearGradient id={gMain} x1="0" y1="18" x2="0" y2="92">
          <stop offset="0" stopColor={mainTop} />
          <stop offset="0.55" stopColor={mainMid} />
          <stop offset="1" stopColor={mainBot} />
        </linearGradient>
        <linearGradient id={gBase} x1="0" y1="76" x2="0" y2="96">
          <stop offset="0" stopColor={baseTop} />
          <stop offset="1" stopColor={baseBot} />
        </linearGradient>
      </defs>
      <Piece />
    </svg>
  );
}
