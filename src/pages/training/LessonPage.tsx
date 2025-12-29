import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useGlobalHotkeys } from '../../ui/useGlobalHotkeys';
import { useTrainingSettings } from './TrainingSettingsContext';
import type { Move, Square } from '../../domain/chessTypes';
import { applyMove } from '../../domain/applyMove';
import { createInitialGameState } from '../../domain/gameState';
import type { Orientation } from '../../domain/localSetup';
import { fromFEN } from '../../domain/notation/fen';
import { moveToUci, parseUciMove } from '../../domain/notation/uci';

import type { LessonBlock, LessonItem, TrainingPack } from '../../domain/training/schema';
import { loadAllPacks } from '../../domain/training/packLoader';
import { makeItemKey, type TrainingItemKey } from '../../domain/training/keys';
import { getLessonBlocks } from '../../domain/training/lessons';
import { normalizeUci } from '../../domain/training/tactics';

import { getLessonProgress, saveLessonProgress, clearLessonProgress } from '../../storage/training/lessonProgressStore';
import { useToastNotice } from '../game/useToastNotice';

import { ChessBoard } from '../../ui/ChessBoard';
import { PromotionChooser } from '../../ui/PromotionChooser';
import { MarkdownLite } from '../../ui/MarkdownLite';
import { useMoveInput, type PendingPromotion } from '../../ui/chessboard/useMoveInput';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; pack: TrainingPack; item: LessonItem; blocks: LessonBlock[]; key: TrainingItemKey };

type TryMoveState = {
  base: ReturnType<typeof fromFEN>;
  state: ReturnType<typeof fromFEN>;
  hintMove: { from: Square; to: Square } | null;
  lastMove: { from: Square; to: Square } | null;
  solved: boolean;
  feedback: string | null;
};

function uciList(v: string | string[]): string[] {
  return Array.isArray(v) ? v : [v];
}

function pickHintMove(expected: string | string[]): { from: Square; to: Square } | null {
  const list = uciList(expected);
  for (const u of list) {
    const parsed = parseUciMove(u);
    if (!parsed) continue;
    return { from: parsed.from, to: parsed.to };
  }
  return null;
}

export function LessonPage() {

  const { settings } = useTrainingSettings();
  const showHintSquares = settings.hintStyle === 'squares' || settings.hintStyle === 'both';
  const showHintArrow = settings.hintStyle === 'arrow' || settings.hintStyle === 'both';

  const { packId, itemId } = useParams();
  const navigate = useNavigate();
  const { noticeText, showNotice } = useToastNotice();

  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [blockIndex, setBlockIndex] = useState(0);
  const [tryMove, setTryMove] = useState<TryMoveState | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const current = useMemo(() => {
    if (load.kind !== 'ready') return null;
    const b = load.blocks[blockIndex] ?? null;
    return b;
  }, [load, blockIndex]);

  const fallbackState = useMemo(() => createInitialGameState(), []);
  const moveInput = useMoveInput({
    state: tryMove?.state ?? fallbackState,
    selectedSquare,
    setSelectedSquare,
    pendingPromotion,
    setPendingPromotion,
    disabled: !tryMove || !current || current.kind !== 'tryMove' || tryMove.solved,
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
        setBlockIndex(Math.max(0, Math.min(blocks.length > 0 ? blocks.length - 1 : 0, prog.currentBlockIndex)));
      }
    })().catch((e) => {
      if (!alive) return;
      setLoad({ kind: 'error', message: (e as Error).message });
    });

    return () => {
      alive = false;
    };
  }, [packId, itemId]);

  // Initialize interactive state when we enter a tryMove block.
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

  const noopSquareClick = (_: Square) => undefined;
  const noopMoveAttempt = (_from: Square, _to: Square, _cands: Move[]) => undefined;

  const legalMoves = moveInput.legalMovesFromSelection;

  useGlobalHotkeys(
    [
      { key: 'n', onKey: () => advance() },
      { key: 'r', onKey: () => restart() },
      { key: 'h', onKey: () => showHintAction() }
    ],
    [current]
  );

  if (load.kind === 'loading') {
    return (
      <div className="card">
        <p className="muted">Loading lesson…</p>
      </div>
    );
  }

  if (load.kind === 'error') {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Lesson</h3>
        <p className="muted">Error: {load.message}</p>
        <div className="actions">
          <Link to="/training/lessons" className="btn btn-secondary">
            Back to lessons
          </Link>
        </div>
      </div>
    );
  }

  const { pack, item, blocks } = load;
  const total = blocks.length;

  
  return (
    <section className="stack">
      {noticeText && (
        <div className="toast" role="status" aria-live="polite">
          {noticeText}
        </div>
      )}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>{item.title ?? 'Lesson'}</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {pack.title}
          </span>
        </div>

        <p className="muted" style={{ marginTop: 6 }}>
          Step {Math.min(total, blockIndex + 1)} / {Math.max(1, total)}
        </p>

        <div className="actions">
          <Link to="/training/lessons" className="btn btn-secondary">
            Back
          </Link>
          <button type="button" className="btn btn-secondary" onClick={restart}>
            Restart
          </button>
        </div>
      </div>

      {!current && (
        <div className="card">
          <p className="muted">This lesson has no content.</p>
        </div>
      )}

      {current && current.kind === 'markdown' && (
        <div className="card">
          <MarkdownLite text={current.markdown} />
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={advance}>
              Continue
            </button>
          </div>
        </div>
      )}

      {current && current.kind === 'diagram' && (
        <div className="card">
          {current.caption && <p className="muted" style={{ marginTop: 0 }}>{current.caption}</p>}
          <ChessBoard
            state={fromFEN(current.fen)}
            orientation={orientation}
            selectedSquare={null}
            legalMovesFromSelection={[]}
            onSquareClick={noopSquareClick}
            onMoveAttempt={noopMoveAttempt}
            disabled
          />
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={advance}>
              Continue
            </button>
          </div>
        </div>
      )}

      {current && current.kind === 'tryMove' && tryMove && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>{current.prompt}</h4>
          {tryMove.feedback && <p className="muted">{tryMove.feedback}</p>}

          <ChessBoard
            state={tryMove.state}
            orientation={orientation}
            selectedSquare={moveInput.selectedSquare}
            legalMovesFromSelection={legalMoves}
            hintMove={tryMove.hintMove}
            showHintSquares={showHintSquares}
            showHintArrow={showHintArrow}
            lastMove={tryMove.lastMove}
            onSquareClick={moveInput.handleSquareClick}
            onMoveAttempt={moveInput.handleMoveAttempt}
            disabled={tryMove.solved || Boolean(pendingPromotion)}
          />

          {pendingPromotion && (
            <PromotionChooser
              color={tryMove.state.sideToMove}
              options={pendingPromotion.options}
              onChoose={moveInput.choosePromotion}
              onCancel={moveInput.cancelPromotion}
            />
          )}

          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={showHintAction}
              disabled={tryMove.solved}
            >
              Hint
            </button>

            {tryMove.solved && (
              <button type="button" className="btn btn-primary" onClick={advance}>
                Continue
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
