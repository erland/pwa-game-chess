import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { Orientation } from '../domain/localSetup';
import type { GameRecord } from '../domain/recording/types';
import type { GameState, Move } from '../domain/chessTypes';

import { getPiece } from '../domain/board';
import { toAlgebraic } from '../domain/square';
import { findKing, isInCheck } from '../domain/attack';

import { getGame } from '../storage/gamesDb';
import { getCapturedPiecesFromState } from '../domain/material/captured';
import { ChessBoard } from '../ui/ChessBoard';
import { CapturedPiecesPanel } from '../ui/CapturedPiecesPanel';
import type { ReplayResult } from '../domain/review/replay';
import { replayGameRecord } from '../domain/review/replay';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; record: GameRecord; replay: ReplayResult };

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, '0')}s`;
}

function formatMoveLabel(move: Move, prevState: GameState): string {
  if (move.isCastle) return move.castleSide === 'q' ? 'O-O-O' : 'O-O';

  const from = toAlgebraic(move.from);
  const to = toAlgebraic(move.to);

  const isCapture = Boolean(getPiece(prevState.board, move.to)) || Boolean(move.isEnPassant);
  const sep = isCapture ? '×' : '→';

  const promo = move.promotion ? `=${move.promotion.toUpperCase()}` : '';
  return `${from}${sep}${to}${promo}`;
}

export function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>('w');

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

  // Keyboard navigation (Left/Right, Home/End)
  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.defaultPrevented) return;
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (target as any)?.isContentEditable) return;

      if (ev.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1));
      if (ev.key === 'ArrowRight') setPly((p) => p + 1);
      if (ev.key === 'Home') setPly(0);
      if (ev.key === 'End') setPly((p) => p + 999999);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const ready = load.kind === 'ready' ? load : null;
  const maxPly = ready ? ready.replay.frames.length - 1 : 0;

  // Clamp ply whenever maxPly changes (End key above may overshoot)
  useEffect(() => {
    if (!ready) return;
    setPly((p) => Math.max(0, Math.min(p, maxPly)));
  }, [ready, maxPly]);

  const frame = ready ? ready.replay.frames[Math.max(0, Math.min(ply, maxPly))] : null;
  const capturedPieces = useMemo(() => (frame ? getCapturedPiecesFromState(frame.state, 'w') : { w: [], b: [] }), [frame]);
  const lastMove = frame?.move ? { from: frame.move.from, to: frame.move.to } : undefined;

  const checkSquares = useMemo(() => {
    if (!frame) return [];
    const c = frame.state.sideToMove;
    if (!isInCheck(frame.state, c)) return [];
    const k = findKing(frame.state, c);
    return k ? [k] : [];
  }, [frame]);

  const title = ready ? `${ready.record.players.white} vs ${ready.record.players.black}` : 'Review';

  const rows = useMemo(() => {
    if (!ready) return [];

    const { frames } = ready.replay;
    const moves = frames.slice(1).map((f) => f.move).filter(Boolean) as Move[];

    const out: Array<{
      moveNo: number;
      white?: { ply: number; label: string };
      black?: { ply: number; label: string };
    }> = [];

    for (let i = 0; i < moves.length; i += 2) {
      const moveNo = i / 2 + 1;

      const wPly = i + 1;
      const wPrev = frames[wPly - 1].state;
      const wMove = moves[i];
      const white = { ply: wPly, label: formatMoveLabel(wMove, wPrev) };

      const bMove = moves[i + 1];
      let black: { ply: number; label: string } | undefined;
      if (bMove) {
        const bPly = i + 2;
        const bPrev = frames[bPly - 1].state;
        black = { ply: bPly, label: formatMoveLabel(bMove, bPrev) };
      }

      out.push({ moveNo, white, black });
    }

    return out;
  }, [ready]);

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

  return (
    <section className="stack">
      <div className="card">
        <div className="reviewHeader">
          <div>
            <h2 style={{ marginBottom: 4 }}>{title}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {new Date(record.finishedAtMs).toLocaleString()} • {record.mode === 'vsComputer' ? 'Vs Computer' : 'Local'}
              • {record.timeControl.kind === 'none'
                ? 'No clock'
                : `${Math.round(record.timeControl.initialSeconds / 60)}m +${record.timeControl.incrementSeconds}s`}
              • {record.result.result} • {record.result.termination}
            </p>
          </div>

          <div className="actions">
            <Link to="/history" className="btn btn-secondary">
              Back
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}
              title="Flip board"
            >
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
            <button type="button" className="btn btn-secondary" onClick={() => setPly(0)} disabled={ply <= 0}>
              ⏮
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPly((p) => Math.max(0, p - 1))}
              disabled={ply <= 0}
            >
              ◀
            </button>
            <div className="reviewPly">
              <span>
                Ply <strong>{ply}</strong> / {maxPly}
              </span>
              <span className="muted">{formatTime(record.finishedAtMs - record.startedAtMs)}</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPly((p) => Math.min(maxPly, p + 1))}
              disabled={ply >= maxPly}
            >
              ▶
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setPly(maxPly)} disabled={ply >= maxPly}>
              ⏭
            </button>
          </div>

          {/* Board */}
          <div style={{ display: 'grid', justifyContent: 'center' }}>
            <CapturedPiecesPanel captured={capturedPieces} showDelta />

            <ChessBoard
              state={frame!.state}
              orientation={orientation}
              selectedSquare={null}
              legalMovesFromSelection={[]}
              lastMove={lastMove}
              checkSquares={checkSquares}
              onSquareClick={() => {}}
              onMoveAttempt={() => {}}
              disabled
            />
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
            <button type="button" className="btn btn-secondary" onClick={() => setPly(0)} disabled={ply === 0}>
              Start
            </button>
          </div>

          <div className="reviewMovesList">
            <table className="reviewMovesTable">
              <thead>
                <tr>
                  <th>#</th>
                  <th>White</th>
                  <th>Black</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.moveNo}>
                    <td className="muted">{r.moveNo}</td>
                    <td>
                      {r.white ? (
                        <button
                          type="button"
                          className={ply === r.white.ply ? 'moveBtn isActive' : 'moveBtn'}
                          onClick={() => setPly(r.white!.ply)}
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
                          className={ply === r.black.ply ? 'moveBtn isActive' : 'moveBtn'}
                          onClick={() => setPly(r.black!.ply)}
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

            {rows.length === 0 && <p className="muted">No moves recorded.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}