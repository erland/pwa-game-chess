import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { TrainingPack } from '../../domain/training/schema';
import { loadBuiltInPacks } from '../../domain/training/packLoader';
import type { TrainingMistakeRecord, TrainingSessionRecord } from '../../storage/training/trainingSessionStore';
import { getTrainingSession, listTrainingMistakes } from '../../storage/training/trainingSessionStore';

function formatDateTime(ms: number): string {
  try {
    const d = new Date(ms);
    return d.toLocaleString();
  } catch {
    return String(ms);
  }
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return '0%';
  return `${Math.round(n * 100)}%`;
}

export function TrainingSessionSummaryPage() {
  const { id } = useParams();
  const [session, setSession] = useState<TrainingSessionRecord | null>(null);
  const [mistakes, setMistakes] = useState<TrainingMistakeRecord[]>([]);
  const [packs, setPacks] = useState<TrainingPack[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!id) return;

    void (async () => {
      try {
        const [s, m, packRes] = await Promise.all([
          getTrainingSession(id),
          listTrainingMistakes(id),
          loadBuiltInPacks().catch(() => ({ packs: [], errors: [] }))
        ]);
        if (!mounted) return;
        setSession(s);
        setMistakes(m);
        setPacks(packRes.packs);
      } catch (e) {
        if (!mounted) return;
        setError((e as Error).message);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  const packTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of packs) map.set(p.id, p.title);
    return (packId: string) => map.get(packId) ?? packId;
  }, [packs]);

  if (!id) {
    return (
      <section className="stack">
        <h2>Session summary</h2>
        <p className="muted">Missing session id.</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="stack">
        <h2>Session summary</h2>
        <p className="muted">Failed to load session: {error}</p>
        <div className="actions">
          <Link className="btn btn-secondary" to="/training">Back to training</Link>
        </div>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="stack">
        <h2>Session summary</h2>
        <p>Loading…</p>
      </section>
    );
  }

  const accuracy = session.attempted > 0 ? session.correct / session.attempted : 0;

  return (
    <section className="stack">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <h2 style={{ margin: 0 }}>Session summary</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              Mode: <strong>{session.mode}</strong> · {formatDateTime(session.startedAtMs)} → {formatDateTime(session.endedAtMs)}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted">Accuracy</div>
            <div className="metaValue">{pct(accuracy)}</div>
          </div>
        </div>

        <div className="row" style={{ gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="muted">Puzzles</div>
            <div><strong>{session.attempted}</strong></div>
          </div>
          <div>
            <div className="muted">Correct</div>
            <div><strong>{session.correct}</strong></div>
          </div>
          <div>
            <div className="muted">Avg time</div>
            <div><strong>{Math.round(session.avgSolveMs)}</strong> ms</div>
          </div>
          <div>
            <div className="muted">Avg cp loss</div>
            <div><strong>{Math.round(session.avgCpLoss)}</strong></div>
          </div>
        </div>

        {session.packIds.length > 0 && (
          <p className="muted" style={{ marginTop: 12 }}>
            Packs: {session.packIds.map((p) => packTitle(p)).join(', ')}
          </p>
        )}

        {Object.keys(session.gradeCounts || {}).length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="muted">Coach grades</div>
            <ul>
              {Object.entries(session.gradeCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <li key={k}>
                    <strong>{k}</strong>: {v}
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="actions" style={{ marginTop: 12 }}>
          <Link className="btn btn-primary" to={`/training/tactics?reviewSession=${encodeURIComponent(session.id)}`}>
            Review mistakes ({mistakes.length})
          </Link>
          <Link className="btn btn-secondary" to="/training">Back to training</Link>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Mistakes</h3>
        {mistakes.length === 0 ? (
          <p className="muted">No mistakes recorded in this session 🎉</p>
        ) : (
          <div className="stack">
            {mistakes.map((m) => (
              <div key={m.id} className="card">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <strong>{packTitle(m.packId)}</strong> · <span className="muted">{m.itemId}</span>
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>{Math.round(m.solveMs)} ms</span>
                </div>                {session.mode === 'tactics' ? (
                  <>
                    <p className="muted" style={{ marginTop: 8 }}>
                      Expected: <code>{m.expectedLineUci.join(' ')}</code>
                    </p>
                    {m.playedLineUci.length > 0 && (
                      <p className="muted" style={{ marginTop: 6 }}>
                        Played: <code>{m.playedLineUci.join(' ')}</code>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="muted" style={{ marginTop: 8 }}>
                      FEN: <code>{m.fen}</code>
                    </p>
                    {m.playedLineUci.length > 0 && (
                      <p className="muted" style={{ marginTop: 6 }}>
                        Moves: <code>{m.playedLineUci.join(' ')}</code>
                      </p>
                    )}
                  </>
                )}{m.message && (
                  <p className="muted" style={{ marginTop: 6 }}>{m.message}</p>
                )}
                <div className="actions" style={{ marginTop: 10 }}>
                  <Link className="btn btn-secondary" to={`/training/tactics?reviewSession=${encodeURIComponent(session.id)}&focus=${encodeURIComponent(m.itemKey)}`}>
                    Retry this
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
