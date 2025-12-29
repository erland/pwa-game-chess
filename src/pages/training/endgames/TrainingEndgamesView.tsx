import { Link } from 'react-router-dom';

import { ChessBoard } from '../../../ui/ChessBoard';
import { PromotionChooser } from '../../../ui/PromotionChooser';

import { parseEndgameGoal } from '../../../domain/training/endgameGoals';

import { EndgamesIntroCard } from './components/EndgamesIntroCard';
import { EndgameListItemCard } from './components/EndgameListItemCard';
import type { UseEndgamesSessionControllerResult } from './useEndgamesSessionController';
import { statusLabel } from './useEndgamesSessionController';

export function TrainingEndgamesView(props: {
  ctrl: UseEndgamesSessionControllerResult;
  showHintSquares: boolean;
  showHintArrow: boolean;
}) {
  const { ctrl, showHintSquares, showHintArrow } = props;

  if (ctrl.solve.kind === 'loading' || ctrl.solve.kind === 'idle') {
    return (
      <section className="stack">
        <p className="muted">Loading endgames…</p>
      </section>
    );
  }

  if (ctrl.solve.kind === 'error') {
    return (
      <section className="stack">
        <h3 style={{ marginTop: 0 }}>Endgames</h3>
        <p className="muted">Failed to load endgames: {ctrl.solve.message}</p>
        <div className="actions">
          <Link className="btn btn-secondary" to="/training">
            Back
          </Link>
        </div>
      </section>
    );
  }

  const session = ctrl.session;
  const showList = !session;

  if (showList) {
    return (
      <section className="stack">
        <EndgamesIntroCard
          availableCount={ctrl.endgameRefs.length}
          startDisabled={ctrl.endgameRefs.length === 0}
          onStartNext={() => void ctrl.startEndgame(null)}
        />

        {ctrl.endgameRefs.length === 0 ? (
          <p className="muted">No endgame items found in built-in packs.</p>
        ) : (
          <div className="stack">
            {ctrl.endgameRefs.map((r) => (
              <EndgameListItemCard
                key={r.key}
                refItem={r}
                stats={ctrl.byKeyStats.get(r.key)}
                onStart={() => void ctrl.startEndgame(r)}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  const goal = parseEndgameGoal(session.ref.goalText);

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ marginTop: 0 }}>Endgame</h3>
        <button type="button" className="btn btn-secondary" onClick={ctrl.backToList}>
          Back to list
        </button>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <strong>{session.ref.packId}</strong> · <span className="muted">{session.ref.itemId}</span>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            Goal: {goal.text ?? goal.kind}
          </span>
        </div>

        {session.result ? (
          <div style={{ marginTop: 10 }}>
            <p className={session.result.success ? '' : 'muted'} style={{ marginTop: 0 }}>
              <strong>{session.result.success ? 'Success' : 'Failed'}</strong> — {session.result.message}{' '}
              <span className="muted">({statusLabel(session.result.statusKind)})</span>
            </p>
            <p className="muted" style={{ marginTop: 6 }}>
              Time: {Math.round(session.result.solveMs / 1000)}s
            </p>
            <div className="actions" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-primary" onClick={() => void ctrl.startEndgame(null)}>
                Next endgame
              </button>
              {session.result.sessionId && (
                <Link className="btn btn-secondary" to={`/training/session/${encodeURIComponent(session.result.sessionId)}`}>
                  Session summary
                </Link>
              )}
            </div>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 8 }}>
            {goal.kind === 'draw'
              ? 'Try to force a draw.'
              : goal.kind === 'promote'
                ? 'Try to promote a pawn.'
                : 'Try to win the position.'}
          </p>
        )}

        <ChessBoard
          state={session.state}
          orientation={ctrl.orientation}
          selectedSquare={ctrl.moveInput.selectedSquare}
          legalMovesFromSelection={ctrl.moveInput.legalMovesFromSelection}
          hintMove={ctrl.hintMove}
          showHintSquares={showHintSquares}
          showHintArrow={showHintArrow}
          lastMove={session.lastMove}
          checkSquares={ctrl.checkSquares}
          onSquareClick={ctrl.moveInput.handleSquareClick}
          onMoveAttempt={ctrl.moveInput.handleMoveAttempt}
          disabled={Boolean(session.result || ctrl.pendingPromotion)}
        />

        {!session.result && (session.feedback || session.lastGrade) && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>Move feedback</strong>
              {session.feedback && (
                <button type="button" className="btn btn-secondary" onClick={ctrl.dismissFeedback}>
                  Dismiss
                </button>
              )}
            </div>
            {session.feedback ? (
              <p className="muted" style={{ marginTop: 8 }}>
                <strong style={{ textTransform: 'capitalize' }}>{session.feedback.severity}</strong> — {session.feedback.message}{' '}
                {session.feedback.bestMoveUci ? (
                  <span className="muted">
                    Best: <code>{session.feedback.bestMoveUci}</code>
                  </span>
                ) : null}
              </p>
            ) : session.lastGrade ? (
              <p className="muted" style={{ marginTop: 8 }}>
                Last move: <strong>{session.lastGrade.label}</strong> · cp loss <strong>{Math.round(session.lastGrade.cpLoss ?? 0)}</strong>
                {session.lastGrade.bestMoveUci ? (
                  <span className="muted">
                    {' '}
                    · Best: <code>{session.lastGrade.bestMoveUci}</code>
                  </span>
                ) : null}
              </p>
            ) : null}

            {session.checkpoint && (
              <p className="muted" style={{ marginTop: 8 }}>
                Checkpoint: <strong>{session.checkpoint.label}</strong> <span className="muted">(press P to retry)</span>
              </p>
            )}
          </div>
        )}

        {ctrl.pendingPromotion && (
          <PromotionChooser
            color={session.state.sideToMove}
            options={ctrl.pendingPromotion.options}
            onChoose={ctrl.moveInput.choosePromotion}
            onCancel={ctrl.moveInput.cancelPromotion}
          />
        )}

        {!session.result && (
          <div className="actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={() => void ctrl.showHint(1)}>
              Hint 1
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void ctrl.showHint(2)}>
              Hint 2
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void ctrl.showHint(3)}>
              Hint 3
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void ctrl.giveUp()}>
              Give up
            </button>

            <button type="button" className="btn btn-secondary" onClick={() => ctrl.setCheckpointNow()}>
              Set checkpoint
            </button>
            {session.checkpoint && (
              <button type="button" className="btn btn-secondary" onClick={ctrl.retryFromCheckpoint}>
                Retry checkpoint
              </button>
            )}
          </div>
        )}

        {session.analysis && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>Coach</strong>
              <button type="button" className="btn btn-secondary" onClick={ctrl.clearCoaching}>
                Clear
              </button>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              Eval: <strong>{session.analysis.scoreCp ?? 0}</strong> cp · Best: <code>{session.analysis.bestMoveUci ?? '—'}</code>
            </p>
            {session.analysis.pv && session.analysis.pv.length > 0 && (
              <p className="muted" style={{ marginTop: 6 }}>
                PV: <code>{session.analysis.pv.join(' ')}</code>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
