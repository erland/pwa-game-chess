import type { RunState, SolveState } from '../useTacticsSessionController';

export function TacticsIntroCard(props: {
  solve: SolveState;
  reviewSessionId: string | null;
  reviewMistakesCount: number;
  reviewIndex: number;
  availableTacticCount: number;
  run: RunState | null;
  startLabel: string;
  startDisabled: boolean;
  canReset: boolean;
  onStartNext: () => void;
  onReset: () => void;
  onEndSession: () => Promise<void>;
  onGoToSessionSummary: () => void;
}) {
  const {
    solve,
    reviewSessionId,
    reviewMistakesCount,
    reviewIndex,
    availableTacticCount,
    run,
    startLabel,
    startDisabled,
    canReset,
    onStartNext,
    onReset,
    onEndSession,
    onGoToSessionSummary
  } = props;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Tactics (multi-move lines)</h3>
      <p className="muted">
        Solve puzzles by playing the best move(s). Some puzzles include expected opponent replies, so you may need to
        find a line (not just one move).
      </p>

      {solve.kind === 'loading' && <p>Loading packs…</p>}
      {solve.kind === 'error' && <p className="muted">Failed to load packs: {solve.message}</p>}

      {solve.kind === 'ready' && (
        <>
          {solve.errors.length > 0 && (
            <div className="notice" role="note" style={{ marginTop: 12 }}>
              <strong>Pack warnings</strong>
              <ul>
                {solve.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={onStartNext} disabled={startDisabled}>
              {startLabel}
            </button>

            <button type="button" className="btn btn-secondary" onClick={onReset} disabled={!canReset}>
              Reset
            </button>

            {!reviewSessionId && run && run.attempted > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => void onEndSession()}>
                End session
              </button>
            )}

            {reviewSessionId && (
              <button type="button" className="btn btn-secondary" onClick={onGoToSessionSummary}>
                Session summary
              </button>
            )}
          </div>

          <p className="muted" style={{ marginTop: 8 }}>
            {reviewSessionId ? (
              <>
                Reviewing mistakes: <strong>{reviewMistakesCount}</strong> · Progress: <strong>{Math.min(reviewIndex, reviewMistakesCount)}</strong> /{' '}
                <strong>{reviewMistakesCount}</strong>
              </>
            ) : (
              <>
                Available tactics: <strong>{availableTacticCount}</strong>
                {run && run.attempted > 0 && (
                  <>
                    {' '}
                    · Session: <strong>{run.correct}</strong> / <strong>{run.attempted}</strong>
                  </>
                )}
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
