import type { ProgressiveHintLevel } from '../../../../domain/coach/types';
import type { Move, Square } from '../../../../domain/chessTypes';
import type { Orientation } from '../../../../domain/localSetup';
import { ChessBoard } from '../../../../ui/ChessBoard';
import type { PendingPromotion } from '../../../../ui/chessboard/useMoveInput';

import type { SessionState } from '../useTacticsSessionController';

export function TacticsPuzzleCard(props: {
  session: SessionState;
  orientation: Orientation;
  checkSquares: Square[];
  hintMove: { from: Square; to: Square } | null;
  moveInput: {
    selectedSquare: Square | null;
    legalMovesFromSelection: Move[];
    handleSquareClick: (sq: Square) => void;
    handleMoveAttempt: (from: Square, to: Square, candidates: Move[]) => void;
    choosePromotion: (move: Move) => void;
    cancelPromotion: () => void;
  };
  pendingPromotion: PendingPromotion | null;
  noticeText: string | null;
  displayedLine: string[] | null;
  progressText: string | null;
  showHintSquares: boolean;
  showHintArrow: boolean;
  onHint: (level: ProgressiveHintLevel) => void;
  onClearHint: () => void;
  onShowLine: () => void;
  onNext: () => void;
  onTryAgain: () => void;
}) {
  const {
    session,
    orientation,
    checkSquares,
    hintMove,
    moveInput,
    pendingPromotion,
    noticeText,
    displayedLine,
    progressText,
    showHintSquares,
    showHintArrow,
    onHint,
    onClearHint,
    onShowLine,
    onNext,
    onTryAgain
  } = props;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h3 style={{ margin: 0 }}>Puzzle</h3>
          <p className="muted" style={{ marginTop: 6 }}>
            Pack: <strong>{session.ref.pack.title}</strong> · Difficulty: <strong>{session.ref.item.difficulty}</strong>
          </p>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div className="muted">Side to move</div>
          <div className="metaValue">{session.baseState.sideToMove === 'w' ? 'White' : 'Black'}</div>
        </div>
      </div>

      {session.ref.item.goal && (
        <div className="notice" role="note" style={{ marginTop: 12 }}>
          <strong>Goal:</strong> {session.ref.item.goal}
        </div>
      )}

      {(progressText || displayedLine) && (
        <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
          {progressText ? (
            <>
              Progress: <strong>{progressText}</strong>
            </>
          ) : null}
          {displayedLine ? (
            <>
              {progressText ? ' · ' : ''}
              Line length: <strong>{displayedLine.length}</strong> ply
            </>
          ) : null}
        </p>
      )}

      {session.playedLineUci.length > 0 && (
        <p className="muted" style={{ marginTop: 6 }}>
          Played: <code>{session.playedLineUci.join(' ')}</code>
        </p>
      )}

      <ChessBoard
        state={session.state}
        orientation={orientation}
        selectedSquare={moveInput.selectedSquare}
        legalMovesFromSelection={moveInput.legalMovesFromSelection}
        hintMove={hintMove}
        showHintSquares={showHintSquares}
        showHintArrow={showHintArrow}
        lastMove={session.lastMove}
        checkSquares={checkSquares}
        onSquareClick={moveInput.handleSquareClick}
        onMoveAttempt={moveInput.handleMoveAttempt}
        disabled={!!session.result || Boolean(pendingPromotion)}
      />

      {noticeText && (
        <div className="toast" role="status" aria-live="polite">
          {noticeText}
        </div>
      )}

      <div className="actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={() => onHint(1)} disabled={!!session.result || session.coachBusy}>
          Hint 1
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onHint(2)} disabled={!!session.result || session.coachBusy}>
          Hint 2
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onHint(3)} disabled={!!session.result || session.coachBusy}>
          Hint 3
        </button>

        {session.hint && (
          <button type="button" className="btn btn-secondary" onClick={onClearHint} disabled={!!session.result || session.coachBusy}>
            Clear hint
          </button>
        )}

        <button type="button" className="btn btn-secondary" onClick={onShowLine} disabled={!!session.result}>
          Show line
        </button>
      </div>

      {session.hint && session.hint.kind === 'line' && (
        <div className="notice" role="note" style={{ marginTop: 12 }}>
          <strong>Line:</strong> <code>{session.hint.pv.join(' ')}</code>
        </div>
      )}

      {session.result && (
        <div className="notice" role="note" style={{ marginTop: 12 }}>
          {session.result.correct ? (
            <>
              ✅ <strong>Correct!</strong> ({session.result.solveMs} ms)
            </>
          ) : (
            <>
              ❌ <strong>Not the expected move.</strong> ({session.result.solveMs} ms)
            </>
          )}

          {session.result.message && (
            <div style={{ marginTop: 8 }}>
              <span className="muted">{session.result.message}</span>
            </div>
          )}

          {session.grade && (
            <div style={{ marginTop: 8 }}>
              Coach grade: <strong>{session.grade.label}</strong>
              {Number.isFinite(session.grade.cpLoss) && (
                <>
                  {' '}
                  · cp loss: <strong>{session.grade.cpLoss}</strong>
                </>
              )}
              {session.grade.bestMoveUci && (
                <>
                  {' '}
                  · best: <code>{session.grade.bestMoveUci}</code>
                </>
              )}
            </div>
          )}

          <div className="actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={onNext}>
              Next
            </button>
            <button type="button" className="btn btn-secondary" onClick={onTryAgain}>
              Try again
            </button>
          </div>
        </div>
      )}

      <p className="muted" style={{ marginTop: 12 }}>
        Tap to move, or drag a piece to a highlighted square.
      </p>
    </div>
  );
}
