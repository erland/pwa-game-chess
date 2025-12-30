import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useGlobalHotkeys } from '../../ui/useGlobalHotkeys';
import type { Move, Square } from '../../domain/chessTypes';
import { applyMove } from '../../domain/applyMove';
import { createInitialGameState } from '../../domain/gameState';
import type { Orientation } from '../../domain/localSetup';
import { fromFEN } from '../../domain/notation/fen';
import { moveToUci } from '../../domain/notation/uci';
import { parseAlgebraicSquare } from '../../domain/square';

import type { LessonBlock, LessonItem, TrainingPack } from '../../domain/training/schema';
import { loadAllPacks } from '../../domain/training/packLoader';
import { makeItemKey, type TrainingItemKey } from '../../domain/training/keys';
import { getLessonBlocks } from '../../domain/training/lessons';
import { normalizeUci } from '../../domain/training/tactics';

import { getLessonProgress, saveLessonProgress, clearLessonProgress } from '../../storage/training/lessonProgressStore';
import { useToastNotice } from '../game/useToastNotice';

import { useMoveInput, type PendingPromotion } from '../../ui/chessboard/useMoveInput';

export type LessonLoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; pack: TrainingPack; item: LessonItem; blocks: LessonBlock[]; key: TrainingItemKey };

export type LessonTryMoveState = {
  base: ReturnType<typeof fromFEN>;
  state: ReturnType<typeof fromFEN>;
  hintMove: { from: Square; to: Square } | null;
  lastMove: { from: Square; to: Square } | null;
  solved: boolean;
  feedback: string | null;
};

export type LessonMoveInputVm = {
  selectedSquare: Square | null;
  legalMovesFromSelection: Move[];
  handleSquareClick: (sq: Square) => void;
  handleMoveAttempt: (from: Square, to: Square, cands: Move[]) => void;
  choosePromotion: (move: Move) => void;
  cancelPromotion: () => void;
};

export type LessonControllerVm = {
  load: LessonLoadState;
  current: LessonBlock | null;
  blockIndex: number;
  orientation: Orientation;
  tryMove: LessonTryMoveState | null;
  pendingPromotion: PendingPromotion | null;
  noticeText: string | null;

  moveInput: LessonMoveInputVm;

  advance: () => void;
  restart: () => void;
  showHintAction: () => void;
};

function uciList(v: string | string[]): string[] {
  return Array.isArray(v) ? v : [v];
}

function pickHintMove(expected: string | string[]): { from: Square; to: Square } | null {
  const uci = normalizeUci(uciList(expected)[0] ?? '');
  if (uci.length < 4) return null;
  const from = parseAlgebraicSquare(uci.slice(0, 2));
  const to = parseAlgebraicSquare(uci.slice(2, 4));
  if (from == null || to == null) return null;
  return { from, to };
}

export function useLessonController(): LessonControllerVm {
  const { packId, itemId } = useParams();
  const navigate = useNavigate();
  const { noticeText, showNotice } = useToastNotice();

  const [load, setLoad] = useState<LessonLoadState>({ kind: 'loading' });
  const [blockIndex, setBlockIndex] = useState(0);
  const [tryMove, setTryMove] = useState<LessonTryMoveState | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const current = useMemo(() => {
    if (load.kind !== 'ready') return null;
    return (load.blocks[blockIndex] ?? null) as LessonBlock | null;
  }, [load, blockIndex]);

  const fallbackState = useMemo(() => createInitialGameState(), []);
  const expectedMoves = useMemo(() => {
    if (!current || current.kind !== 'tryMove') return [];
    return uciList(current.expectedUci).map(normalizeUci);
  }, [current]);

  function advance() {
    if (load.kind !== 'ready') return;
    const next = blockIndex + 1;
    if (next >= load.blocks.length) {
      // Complete.
      saveLessonProgress(load.key, blockIndex, { completed: true }).catch(() => undefined);
      showNotice('Lesson completed');
      navigate('/training/lessons');
      return;
    }
    setBlockIndex(next);
  }

  function restart() {
    if (load.kind !== 'ready') return;
    clearLessonProgress(load.key).catch(() => undefined);
    setBlockIndex(0);
  }

  function showHintAction() {
    if (!current || current.kind !== 'tryMove') return;
    setTryMove((prev) =>
      prev
        ? {
            ...prev,
            hintMove: pickHintMove(current.expectedUci),
            feedback: current.hintMarkdown ?? 'Hint shown'
          }
        : prev
    );
  }

  function tryApplyMove(move: Move) {
    if (!tryMove || !current || current.kind !== 'tryMove') return;

    // Clear any in-progress input state on each attempted move.
    setSelectedSquare(null);
    setPendingPromotion(null);

    const played = normalizeUci(moveToUci(move));
    const isCorrect = expectedMoves.includes(played);
    const next = applyMove(tryMove.state, move);

    setTryMove((prev) =>
      prev
        ? {
            ...prev,
            state: next,
            lastMove: { from: move.from, to: move.to },
            solved: isCorrect,
            feedback: isCorrect ? 'Correct!' : prev.feedback
          }
        : prev
    );

    if (isCorrect) return;

    const behavior = current.wrongBehavior ?? 'hint';
    const hintText = current.hintMarkdown ?? 'Try again.';

    if (behavior === 'rewind') {
      setTryMove((prev) => (prev ? { ...prev, state: prev.base, lastMove: null, feedback: hintText } : prev));
      return;
    }

    if (behavior === 'reveal') {
      setTryMove((prev) =>
        prev
          ? {
              ...prev,
              hintMove: pickHintMove(current.expectedUci),
              feedback: `Expected: ${uciList(current.expectedUci).join(' or ')}`
            }
          : prev
      );
      return;
    }

    // default: hint
    setTryMove((prev) => (prev ? { ...prev, feedback: hintText } : prev));
  }

  const moveInputAll = useMoveInput({
    state: tryMove?.state ?? fallbackState,
    selectedSquare,
    setSelectedSquare,
    pendingPromotion,
    setPendingPromotion,
    onMove: (move) => tryApplyMove(move),
    showNotice,
    illegalNoticeMode: 'pseudo'
  });

  // Load packs + lesson item.
  useEffect(() => {
    let alive = true;
    setLoad({ kind: 'loading' });

    (async () => {
      if (!packId || !itemId) throw new Error('Missing lesson route params');

      const res = await loadAllPacks();
      const pack = res.packs.find((p) => p.id === packId);
      if (!pack) throw new Error(`Pack not found: ${packId}`);

      const item = pack.items.find((it) => it.type === 'lesson' && it.itemId === itemId) as LessonItem | undefined;
      if (!item) throw new Error(`Lesson not found: ${itemId}`);

      const key = makeItemKey(pack.id, item.itemId);
      const blocks = getLessonBlocks(item);

      if (!alive) return;
      setLoad({ kind: 'ready', pack, item, blocks, key });

      // Restore progress (best-effort).
      const prog = await getLessonProgress(key);
      if (!alive) return;
      if (prog && Number.isFinite(prog.currentBlockIndex)) {
        setBlockIndex(Math.max(0, Math.min(blocks.length - 1, prog.currentBlockIndex)));
      }
    })().catch((err: unknown) => {
      if (!alive) return;
      const msg = err instanceof Error ? err.message : String(err);
      setLoad({ kind: 'error', message: msg });
    });

    return () => {
      alive = false;
    };
  }, [packId, itemId]);

  // Reset try-move state whenever we enter a tryMove block.
  useEffect(() => {
    if (load.kind !== 'ready') return;
    const block = current;
    if (!block || block.kind !== 'tryMove') {
      setTryMove(null);
      setSelectedSquare(null);
      setPendingPromotion(null);
      return;
    }

    const base = fromFEN(block.fen);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setTryMove({
      base,
      state: base,
      hintMove: null,
      lastMove: null,
      solved: false,
      feedback: null
    });
  }, [load, current]);

  // Persist progress (best-effort) whenever the block index changes.
  useEffect(() => {
    if (load.kind !== 'ready') return;
    saveLessonProgress(load.key, blockIndex).catch(() => undefined);
  }, [load, blockIndex]);

  const orientation: Orientation = useMemo(() => {
    if (!current) return 'w';
    if (current.kind === 'diagram') return (current.orientation ?? 'w');
    if (current.kind === 'tryMove') return (tryMove?.base.sideToMove ?? 'w');
    return 'w';
  }, [current, tryMove]);

  useGlobalHotkeys(
    [
      { key: 'n', onKey: () => advance() },
      { key: 'r', onKey: () => restart() },
      { key: 'h', onKey: () => showHintAction() }
    ],
    [current]
  );

  const moveInput: LessonMoveInputVm = {
    selectedSquare: moveInputAll.selectedSquare,
    legalMovesFromSelection: moveInputAll.legalMovesFromSelection,
    handleSquareClick: moveInputAll.handleSquareClick,
    handleMoveAttempt: moveInputAll.handleMoveAttempt,
    choosePromotion: moveInputAll.choosePromotion,
    cancelPromotion: moveInputAll.cancelPromotion
  };

  return {
    load,
    current,
    blockIndex,
    orientation,
    tryMove,
    pendingPromotion,
    noticeText,
    moveInput,
    advance,
    restart,
    showHintAction
  };
}
