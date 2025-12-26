import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GameRecord, TimeControl } from '../domain/recording/types';
import { deleteGame, listGames } from '../storage/gamesDb';
import { ConfirmDialog } from '../ui/ConfirmDialog';

type PendingDelete = { id: string; title: string } | null;

function formatMode(mode: GameRecord['mode']): string {
  return mode === 'vsComputer' ? 'Vs Computer' : 'Local';
}

function formatTimeControl(tc: TimeControl): string {
  if (tc.kind === 'none') return 'No clock';
  const mins = tc.initialSeconds / 60;
  const init = Number.isInteger(mins) ? `${mins}m` : `${tc.initialSeconds}s`;
  const inc = tc.incrementSeconds;
  return `${init} +${inc}s`;
}

function formatResult(r: GameRecord['result']): string {
  // Keep this short; details can be shown in v4 review.
  const termMap: Record<GameRecord['result']['termination'], string> = {
    checkmate: 'Checkmate',
    stalemate: 'Stalemate',
    drawInsufficientMaterial: 'Draw (material)',
    drawAgreement: 'Draw (agreement)',
    resign: 'Resignation',
    timeout: 'Timeout'
  };
  return `${r.result} • ${termMap[r.termination] ?? r.termination}`;
}

function formatDurationMs(startedAtMs: number, finishedAtMs: number): string {
  const d = Math.max(0, finishedAtMs - startedAtMs);
  const totalSec = Math.round(d / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return mm > 0 ? `${mm}m ${String(ss).padStart(2, '0')}s` : `${ss}s`;
}

export function HistoryPage() {
  const [games, setGames] = useState<GameRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  async function refresh() {
    setIsLoading(true);
    setError(null);
    try {
      const all = await listGames();
      setGames(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = games.length;

  const emptyState = useMemo(() => {
    if (isLoading) return null;
    if (total > 0) return null;
    return (
      <div className="card">
        <h2>History</h2>
        <p className="muted">No finished games saved yet.</p>
        <div className="actions">
          <Link to="/local/setup" className="btn btn-primary">
            Play a local game
          </Link>
          <Link to="/vs-computer/setup" className="btn">
            Play vs computer
          </Link>
        </div>
      </div>
    );
  }, [isLoading, total]);

  return (
    <section className="stack">
      <div className="card">
        <div className="historyItemHeader">
          <div>
            <h2>History</h2>
            <p className="muted">
              Finished games stored on this device. ({isLoading ? 'Loading…' : `${total} total`})
            </p>
            {error && <p className="muted">Error: {error}</p>}
          </div>

          <div className="actions">
            <button type="button" className="btn btn-secondary" onClick={() => void refresh()} disabled={isLoading}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {emptyState}

      {total > 0 && (
        <div className="historyList" aria-label="Game history">
          {games.map((g) => {
            const title = `${g.players.white} vs ${g.players.black}`;
            const finished = new Date(g.finishedAtMs).toLocaleString();
            return (
              <div key={g.id} className="card">
                <div className="historyItemHeader">
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline' }}>
                      <strong>{title}</strong>
                      <span className="muted">{finished}</span>
                    </div>
                    <div className="muted">{formatResult(g.result)}</div>
                  </div>

                  <div className="actions">
                    <Link to={`/review/${g.id}`} className="btn">
                      Review
                    </Link>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setPendingDelete({ id: g.id, title })}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="historyMeta" aria-label="Game details">
                  <span>{formatMode(g.mode)}</span>
                  <span>{formatTimeControl(g.timeControl)}</span>
                  <span>{g.moves.length} moves</span>
                  <span>{formatDurationMs(g.startedAtMs, g.finishedAtMs)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete game?"
          message={`Delete “${pendingDelete.title}” from history? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const id = pendingDelete.id;
            setPendingDelete(null);
            void (async () => {
              try {
                await deleteGame(id);
                setGames((prev) => prev.filter((g) => g.id !== id));
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to delete game');
              }
            })();
          }}
        />
      )}
    </section>
  );
}
