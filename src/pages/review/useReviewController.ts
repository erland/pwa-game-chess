import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type { Orientation } from '../../domain/localSetup';
import type { GameRecord } from '../../domain/recording/types';
import type { Move, Square } from '../../domain/chessTypes';
import type { ReplayFrame, ReplayResult } from '../../domain/review/replay';
import type { CapturedPieces } from '../../domain/material/captured';

import { findKing, isInCheck } from '../../domain/attack';
import { toSAN } from '../../domain/notation/san';
import { toFEN } from '../../domain/notation/fen';
import { toPGN } from '../../domain/notation/pgn';

import { getGame } from '../../storage/gamesDb';
import { getCapturedPiecesFromState } from '../../domain/material/captured';
import { replayGameRecord } from '../../domain/review/replay';

export type ReviewLoadState =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; record: GameRecord; replay: ReplayResult };

export type ReviewMoveRow = {
  moveNo: number;
  white?: { ply: number; label: string };
  black?: { ply: number; label: string };
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy method
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export type ReviewController = {
  load: ReviewLoadState;

  ply: number;
  maxPly: number;
  setPly: (next: number | ((p: number) => number)) => void;

  orientation: Orientation;
  flipOrientation: () => void;

  /** Ref to the move list container (used for keeping the active move visible). */
  moveListRef: RefObject<HTMLDivElement>;

  /** Derived from current ply/frame (when ready). */
  frame: ReplayFrame | null;
  capturedPieces: CapturedPieces;
  lastMove?: { from: Square; to: Square } | null;
  checkSquares: Square[];
  title: string;

  /** Export/notation */
  fenText: string;
  pgnText: string;
  pgnDownload: string | null;

  exportNotice: string | null;
  copyFen: () => Promise<void>;
  copyPgn: () => Promise<void>;

  /** Navigation helpers */
  goFirst: () => void;
  goPrev: () => void;
  goNext: () => void;
  goLast: () => void;

  /** Move list rows */
  rows: ReviewMoveRow[];
};

export function useReviewController(id: string | undefined): ReviewController {
  const [load, setLoad] = useState<ReviewLoadState>({ kind: 'loading' });
  const [ply, setPly] = useState(0);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<Orientation>('w');

  const moveListRef = useRef<HTMLDivElement>(null);
  const maxPlyRef = useRef(0);

  // Load record + build replay frames.
  useEffect(() => {
    let alive = true;

    async function run() {
      if (!id) {
        if (alive) setLoad({ kind: 'notFound' });
        return;
      }

      try {
        const rec = await getGame(id);
        if (!alive) return;

        if (!rec) {
          setLoad({ kind: 'notFound' });
          return;
        }

        const rep = replayGameRecord(rec, { validateLegal: true, stopOnError: true });
        setLoad({ kind: 'ready', record: rec, replay: rep });
        setPly(0);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (alive) setLoad({ kind: 'error', message: msg });
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [id]);

  const ready = load.kind === 'ready' ? load : null;
  const maxPly = ready ? ready.replay.frames.length - 1 : 0;

  useEffect(() => {
    maxPlyRef.current = maxPly;
  }, [maxPly]);

  // Clamp ply whenever maxPly changes (End key above may overshoot).
  useEffect(() => {
    if (!ready) return;
    setPly((p) => Math.max(0, Math.min(p, maxPly)));
  }, [ready, maxPly]);

  // Keyboard navigation (Left/Right, Home/End).
  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.defaultPrevented) return;

      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (target as any)?.isContentEditable) return;

      if (ev.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1));
      if (ev.key === 'ArrowRight') setPly((p) => Math.min(maxPlyRef.current, p + 1));
      if (ev.key === 'Home') setPly(0);
      if (ev.key === 'End') setPly(maxPlyRef.current);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Keep the active move visible when stepping through the game.
  useEffect(() => {
    const root = moveListRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>('.moveBtn.isActive');
    if (active && typeof (active as any).scrollIntoView === 'function') {
      (active as any).scrollIntoView({ block: 'nearest' });
    }
  }, [ply]);

  const frame = useMemo(() => {
    if (!ready) return null;
    return ready.replay.frames[Math.max(0, Math.min(ply, maxPly))] ?? null;
  }, [ready, ply, maxPly]);

  const capturedPieces: CapturedPieces = useMemo(() => {
    if (!frame) return { w: [], b: [] };
    return getCapturedPiecesFromState(frame.state, 'w');
  }, [frame]);

  const lastMove = useMemo(() => {
    if (!frame?.move) return null;
    return { from: frame.move.from, to: frame.move.to };
  }, [frame]);

  const checkSquares: Square[] = useMemo(() => {
    if (!frame) return [];
    const c = frame.state.sideToMove;
    if (!isInCheck(frame.state, c)) return [];
    const k = findKing(frame.state, c);
    return k ? [k] : [];
  }, [frame]);

  const title = useMemo(() => {
    if (!ready) return 'Review';
    return `${ready.record.players.white} vs ${ready.record.players.black}`;
  }, [ready?.record.id]);

  const fenText = useMemo(() => {
    if (!frame) return '';
    return toFEN(frame.state);
  }, [frame]);

  const pgnText = useMemo(() => {
    if (!ready) return '';
    return toPGN(ready.record);
  }, [ready?.record.id]);

  const pgnDownload = useMemo(() => {
    if (!pgnText) return null;
    try {
      return URL.createObjectURL(new Blob([pgnText], { type: 'application/x-chess-pgn' }));
    } catch {
      return null;
    }
  }, [pgnText]);

  useEffect(() => {
    return () => {
      if (pgnDownload) URL.revokeObjectURL(pgnDownload);
    };
  }, [pgnDownload]);

  const rows: ReviewMoveRow[] = useMemo(() => {
    if (!ready) return [];

    const { frames } = ready.replay;
    const moves = frames.slice(1).map((f) => f.move).filter(Boolean) as Move[];

    const out: ReviewMoveRow[] = [];
    for (let i = 0; i < moves.length; i += 2) {
      const moveNo = i / 2 + 1;

      const wPly = i + 1;
      const wPrev = frames[wPly - 1].state;
      const wMove = moves[i];
      const white = { ply: wPly, label: toSAN(wPrev, wMove) };

      const bMove = moves[i + 1];
      let black: { ply: number; label: string } | undefined;
      if (bMove) {
        const bPly = i + 2;
        const bPrev = frames[bPly - 1].state;
        black = { ply: bPly, label: toSAN(bPrev, bMove) };
      }

      out.push({ moveNo, white, black });
    }

    return out;
  }, [ready]);

  async function showExportNotice(ok: boolean, successLabel: string) {
    setExportNotice(ok ? successLabel : 'Copy failed');
    window.setTimeout(() => setExportNotice(null), 1200);
  }

  const copyFen = async () => {
    const ok = await copyText(fenText);
    await showExportNotice(ok, 'Copied FEN');
  };

  const copyPgn = async () => {
    const ok = await copyText(pgnText);
    await showExportNotice(ok, 'Copied PGN');
  };

  const flipOrientation = () => setOrientation((o) => (o === 'w' ? 'b' : 'w'));

  const goFirst = () => setPly(0);
  const goPrev = () => setPly((p) => Math.max(0, p - 1));
  const goNext = () => setPly((p) => Math.min(maxPly, p + 1));
  const goLast = () => setPly(maxPly);

  return {
    load,

    ply,
    maxPly,
    setPly,

    orientation,
    flipOrientation,

    moveListRef,

    frame,
    capturedPieces,
    lastMove,
    checkSquares,
    title,

    fenText,
    pgnText,
    pgnDownload,

    exportNotice,
    copyFen,
    copyPgn,

    goFirst,
    goPrev,
    goNext,
    goLast,

    rows,
  };
}
