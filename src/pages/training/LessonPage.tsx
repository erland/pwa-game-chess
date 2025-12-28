import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { Move, Square } from '../../domain/chessTypes';
import { applyMove } from '../../domain/applyMove';
import { generateLegalMoves } from '../../domain/legalMoves';
import { generatePseudoLegalMoves } from '../../domain/movegen';
import { getPiece } from '../../domain/board';
import type { Orientation } from '../../domain/localSetup';
import { fromFEN } from '../../domain/notation/fen';
import { moveToUci, parseUciMove } from '../../domain/notation/uci';

import type { LessonBlock, LessonItem, TrainingPack } from '../../domain/training/schema';
import { loadBuiltInPacks } from '../../domain/training/packLoader';
import { makeItemKey, type TrainingItemKey } from '../../domain/training/keys';
import { getLessonBlocks } from '../../domain/training/lessons';
import { normalizeUci } from '../../domain/training/tactics';

import { getLessonProgress, saveLessonProgress, clearLessonProgress } from '../../storage/training/lessonProgressStore';
import { useToastNotice } from '../game/useToastNotice';

import { ChessBoard } from '../../ui/ChessBoard';
import { PromotionChooser } from '../../ui/PromotionChooser';
import { MarkdownLite } from '../../ui/MarkdownLite';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; pack: TrainingPack; item: LessonItem; blocks: LessonBlock[]; key: TrainingItemKey };

type PendingPromotion = { from: Square; to: Square; options: Move[] };

type TryMoveState = {
  base: ReturnType<typeof fromFEN>;
  state: ReturnType<typeof fromFEN>;
  selectedSquare: Square | null;
  hintMove: { from: Square; to: Square } | null;
  lastMove: { from: Square; to: Square } | null;
  solved: boolean;
  feedback: string | null;
  pendingPromotion: PendingPromotion | null;
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
  const { packId, itemId } = useParams();
  const navigate = useNavigate();
  const { noticeText, showNotice } = useToastNotice();

  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [blockIndex, setBlockIndex] = useState(0);
  const [tryMove, setTryMove] = useState<TryMoveState | null>(null);

  // Load packs + lesson item.
  useEffect(() => {
    let alive = true;
    setLoad({ kind: 'loading' });

    (async () => {
      if (!packId || !itemId) throw new Error('Missing lesson route params');

      const res = await loadBuiltInPacks();
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

  const current = useMemo(() => {
    if (load.kind !== 'ready') return null;
    const b = load.blocks[blockIndex] ?? null;
    return b;
  }, [load, blockIndex]);

  // Initialize interactive state when we enter a tryMove block.
  useEffect(() => {
    if (load.kind !== 'ready') return;
    const block = current;
    if (!block || block.kind !== 'tryMove') {
      setTryMove(null);
      return;
    }

    const base = fromFEN(block.fen);
    setTryMove({
      base,
      state: base,
      selectedSquare: null,
      hintMove: null,
      lastMove: null,
      solved: false,
      feedback: null,
      pendingPromotion: null
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

  function tryApplyMove(move: Move) {
    if (!tryMove || !current || current.kind !== 'tryMove') return;

    const played = normalizeUci(moveToUci(move));
    const isCorrect = expectedMoves.includes(played);
    const next = applyMove(tryMove.state, move);

    setTryMove((prev) =>
      prev
        ? {
            ...prev,
            state: next,
            lastMove: { from: move.from, to: move.to },
            selectedSquare: null,
            pendingPromotion: null,
            solved: isCorrect,
            feedback: isCorrect ? 'Correct!' : prev.feedback
          }
        : prev
    );

    if (isCorrect) return;

    const behavior = current.wrongBehavior ?? 'hint';
    const hintText = current.hintMarkdown ?? 'Try again.';

    if (behavior === 'rewind') {
      setTryMove((prev) => (prev ? { ...prev, state: prev.base, selectedSquare: null, lastMove: null, feedback: hintText } : prev));
      return;
    }

    if (behavior === 'reveal') {
      setTryMove((prev) => (prev ? { ...prev, hintMove: pickHintMove(current.expectedUci), feedback: `Expected: ${uciList(current.expectedUci).join(' or ')}` } : prev));
      return;
    }

    // default: hint
    setTryMove((prev) => (prev ? { ...prev, feedback: hintText } : prev));
  }

  function handleSquareClick(square: Square) {
    if (!tryMove || !current || current.kind !== 'tryMove') return;
    if (tryMove.solved) return;
    if (tryMove.pendingPromotion) return;

    const piece = getPiece(tryMove.state.board, square);
    const isOwnPiece = piece != null && piece.color === tryMove.state.sideToMove;

    if (tryMove.selectedSquare === null) {
      if (isOwnPiece) setTryMove((prev) => (prev ? { ...prev, selectedSquare: square } : prev));
      return;
    }

    if (square === tryMove.selectedSquare) {
      setTryMove((prev) => (prev ? { ...prev, selectedSquare: null } : prev));
      return;
    }

    if (isOwnPiece) {
      setTryMove((prev) => (prev ? { ...prev, selectedSquare: square } : prev));
      return;
    }

    const from = tryMove.selectedSquare;
    const candidates = generateLegalMoves(tryMove.state, from).filter((m) => m.to === square);
    if (candidates.length === 0) {
      const pseudo = generatePseudoLegalMoves(tryMove.state, from).filter((m) => m.to === square);
      showNotice(pseudo.length > 0 ? 'King would be in check' : 'Illegal move');
      return;
    }

    handleMoveAttempt(from, square, candidates);
  }

  function handleMoveAttempt(from: Square, to: Square, candidates: Move[]) {
    if (!tryMove || !current || current.kind !== 'tryMove') return;
    if (tryMove.solved) return;
    if (tryMove.pendingPromotion) return;

    if (candidates.length === 0) {
      const pseudo = generatePseudoLegalMoves(tryMove.state, from).filter((m) => m.to === to);
      showNotice(pseudo.length > 0 ? 'King would be in check' : 'Illegal move');
      setTryMove((prev) => (prev ? { ...prev, selectedSquare: from } : prev));
      return;
    }

    const promo = candidates.filter((m) => m.promotion);
    if (promo.length > 0) {
      setTryMove((prev) => (prev ? { ...prev, pendingPromotion: { from, to, options: promo } } : prev));
      return;
    }

    tryApplyMove(candidates[0]);
  }

  function choosePromotion(move: Move) {
    tryApplyMove(move);
  }

  const noopSquareClick = (_: Square) => undefined;
  const noopMoveAttempt = (_from: Square, _to: Square, _cands: Move[]) => undefined;

  const legalMoves = useMemo(() => {
    if (!tryMove || tryMove.selectedSquare === null) return [];
    return generateLegalMoves(tryMove.state, tryMove.selectedSquare);
  }, [tryMove]);

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
            selectedSquare={tryMove.selectedSquare}
            legalMovesFromSelection={legalMoves}
            hintMove={tryMove.hintMove}
            lastMove={tryMove.lastMove}
            onSquareClick={handleSquareClick}
            onMoveAttempt={handleMoveAttempt}
            disabled={false}
          />

          {tryMove.pendingPromotion && (
            <PromotionChooser
              color={tryMove.state.sideToMove}
              options={tryMove.pendingPromotion.options}
              onChoose={choosePromotion}
              onCancel={() => setTryMove((prev) => (prev ? { ...prev, pendingPromotion: null } : prev))}
            />
          )}

          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTryMove((prev) => (prev ? { ...prev, hintMove: pickHintMove(current.expectedUci), feedback: current.hintMarkdown ?? 'Hint shown' } : prev))}
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
