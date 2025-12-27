import { Link } from 'react-router-dom';

import { ChessBoard } from '../../ui/ChessBoard';
import { CapturedPiecesPanel } from '../../ui/CapturedPiecesPanel';

import type { ReviewController } from './useReviewController';

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, '0')}s`;
}

export function ReviewPageView({ c }: { c: ReviewController }) {
  const { load } = c;

  if (load.kind === 'loading') {
    return (
      <section className="stack">
        <div className="card">
          <h2>Review</h2>
          <p className="muted">Loading…</p>
        </div>
      </section>
    );
  }

  if (load.kind === 'notFound') {
    return (
      <section className="stack">
        <div className="card">
          <h2>Review</h2>
          <p className="muted">Game not found.</p>
          <div className="actions">
            <Link to="/history" className="btn">
              Back to History
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (load.kind === 'error') {
    return (
      <section className="stack">
        <div className="card">
          <h2>Review</h2>
          <p className="muted">Failed to load game.</p>
          <pre className="pre">{load.message}</pre>
          <div className="actions">
            <Link to="/history" className="btn">
              Back to History
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const { record, replay } = load;
  const durationMs = record.finishedAtMs - record.startedAtMs;

  return (
    <section className="stack">
      <div className="card">
        <div className="reviewHeader">
          <div>
            <h2 style={{ marginBottom: 4 }}>{c.title}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {new Date(record.finishedAtMs).toLocaleString()} • {record.mode === 'vsComputer' ? 'Vs Computer' : 'Local'} •{' '}
              {record.timeControl.kind === 'none'
                ? 'No clock'
                : `${Math.round(record.timeControl.initialSeconds / 60)}m +${record.timeControl.incrementSeconds}s`}{' '}
              • {record.result.result} • {record.result.termination}
            </p>
          </div>

          <div className="actions">
            <Link to="/history" className="btn btn-secondary">
              Back
            </Link>
            <button type="button" className="btn btn-secondary" onClick={c.flipOrientation} title="Flip board">
              Flip
            </button>
          </div>
        </div>
      </div>

      {replay.errors.length > 0 && (
        <div className="card">
          <h3 className="h3">Replay warnings</h3>
          <p className="muted" style={{ marginTop: 6 }}>
            This record could not be fully validated. Showing the last valid position.
          </p>
          <ul className="list">
            {replay.errors.slice(0, 5).map((e) => (
              <li key={`${e.ply}-${e.reason}`}>
                Ply {e.ply}: {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="reviewLayout">
        <div className="card reviewBoardCard">
          <div className="reviewNav">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={c.goFirst}
              disabled={c.ply <= 0}
              aria-label="First move"
              title="First"
            >
              ⏮
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={c.goPrev}
              aria-label="Previous move"
              title="Previous"
              disabled={c.ply <= 0}
            >
              ◀
            </button>
            <div className="reviewPly">
              <span data-testid="review-ply">
                Ply <strong>{c.ply}</strong> / {c.maxPly}
              </span>
              <span className="muted">{formatTime(durationMs)}</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={c.goNext}
              aria-label="Next move"
              title="Next"
              disabled={c.ply >= c.maxPly}
            >
              ▶
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={c.goLast}
              disabled={c.ply >= c.maxPly}
              aria-label="Last move"
              title="Last"
            >
              ⏭
            </button>
          </div>

          {/* Notation & export */}
          <div className="card">
            <h3 className="h3">Notation &amp; export</h3>

            {c.exportNotice && (
              <p className="muted" role="status" aria-live="polite">
                {c.exportNotice}
              </p>
            )}

            <div className="reviewExportGrid">
              <div>
                <div className="muted">FEN (current position)</div>
                <pre className="pre preSmall" aria-label="FEN">
                  {c.fenText}
                </pre>
                <div className="actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={c.copyFen}
                    disabled={!c.frame}
                    aria-label="Copy FEN to clipboard"
                  >
                    Copy FEN
                  </button>
                </div>
              </div>

              <div>
                <div className="muted">PGN (full game)</div>
                <pre className="pre preSmall" aria-label="PGN">
                  {c.pgnText}
                </pre>
                <div className="actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={c.copyPgn}
                    disabled={!c.pgnText}
                    aria-label="Copy PGN to clipboard"
                  >
                    Copy PGN
                  </button>

                  {c.pgnDownload && (
                    <a className="btn" href={c.pgnDownload} download={`${record.id}.pgn`} aria-label="Download PGN file">
                      Download PGN
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Board */}
          <div style={{ display: 'grid', justifyContent: 'center' }}>
            <CapturedPiecesPanel captured={c.capturedPieces} showDelta />

            {c.frame && (
              <ChessBoard
                state={c.frame.state}
                orientation={c.orientation}
                selectedSquare={null}
                legalMovesFromSelection={[]}
                lastMove={c.lastMove ?? undefined}
                checkSquares={c.checkSquares}
                onSquareClick={() => {}}
                onMoveAttempt={() => {}}
                disabled
              />
            )}
          </div>

          <p className="muted" style={{ marginTop: 8 }}>
            Tip: use <strong>←</strong>/<strong>→</strong> to step, <strong>Home</strong>/<strong>End</strong> to jump.
          </p>
        </div>

        <div className="card reviewMovesCard" aria-label="Move list">
          <div className="reviewMovesHeader">
            <h3 className="h3" style={{ margin: 0 }}>
              Moves
            </h3>
            <button type="button" className="btn btn-secondary" onClick={c.goFirst} disabled={c.ply === 0}>
              Start
            </button>
          </div>

          <div className="reviewMovesList" ref={c.moveListRef}>
            <table className="reviewMovesTable">
              <caption className="srOnly">Moves in SAN notation</caption>
              <thead>
                <tr>
                  <th>#</th>
                  <th>White</th>
                  <th>Black</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.moveNo}>
                    <td className="muted">{r.moveNo}</td>
                    <td>
                      {r.white ? (
                        <button
                          type="button"
                          className={c.ply === r.white.ply ? 'moveBtn isActive' : 'moveBtn'}
                          onClick={() => c.setPly(r.white!.ply)}
                          aria-current={c.ply === r.white.ply ? 'true' : undefined}
                          aria-label={`Go to move ${r.moveNo}. White: ${r.white.label}`}
                        >
                          {r.white.label}
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {r.black ? (
                        <button
                          type="button"
                          className={c.ply === r.black.ply ? 'moveBtn isActive' : 'moveBtn'}
                          onClick={() => c.setPly(r.black!.ply)}
                          aria-current={c.ply === r.black.ply ? 'true' : undefined}
                          aria-label={`Go to move ${r.moveNo}. Black: ${r.black.label}`}
                        >
                          {r.black.label}
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {c.rows.length === 0 && <p className="muted">No moves recorded.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
