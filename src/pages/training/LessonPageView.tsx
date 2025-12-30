import { Link } from 'react-router-dom';

import type { Move, Square } from '../../domain/chessTypes';
import { fromFEN } from '../../domain/notation/fen';

import { ChessBoard } from '../../ui/ChessBoard';
import { PromotionChooser } from '../../ui/PromotionChooser';
import { MarkdownLite } from '../../ui/MarkdownLite';

import type { LessonControllerVm } from './useLessonController';

type Props = LessonControllerVm & {
  showHintSquares: boolean;
  showHintArrow: boolean;
};

export function LessonPageView(props: Props) {
  const {
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
    showHintAction,
    showHintSquares,
    showHintArrow
  } = props;

  const noopSquareClick = (_: Square) => undefined;
  const noopMoveAttempt = (_from: Square, _to: Square, _cands: Move[]) => undefined;

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

  const legalMoves = moveInput.legalMovesFromSelection;

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
          {current.caption && (
            <p className="muted" style={{ marginTop: 0 }}>
              {current.caption}
            </p>
          )}
          <ChessBoard
            state={fromFEN(current.fen)}
            orientation={orientation}
            selectedSquare={null}
            legalMovesFromSelection={[]}
            hintMove={null}
            showHintSquares={false}
            showHintArrow={false}
            lastMove={null}
            onSquareClick={noopSquareClick}
            onMoveAttempt={noopMoveAttempt}
            disabled={true}
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
          {/* `tryMove` blocks use `prompt` (plain text / markdown-lite). */}
          {current.prompt && <MarkdownLite text={current.prompt} />}

          {tryMove.feedback && (
            <p className="muted" style={{ marginTop: current.prompt ? 12 : 0 }}>
              {tryMove.feedback}
            </p>
          )}

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
            <button type="button" className="btn btn-secondary" onClick={showHintAction} disabled={tryMove.solved}>
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
