import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadBuiltInPacks } from '../../domain/training/packLoader';
import type { TrainingPack, TrainingItem } from '../../domain/training/schema';
import { parseItemKey } from '../../domain/training/keys';
import { ensureDailyQueue, type TrainingDailyQueue, type TrainingItemStats, listItemStats } from '../../storage/training/trainingStore';
import { overallAccuracy } from '../../domain/training/selectors';

type Status = 'idle' | 'loading' | 'ready' | 'error';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function todayLocalIsoDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function findItem(packs: TrainingPack[], key: string): { pack: TrainingPack; item: TrainingItem } | null {
  const parsed = parseItemKey(key);
  if (!parsed) return null;
  const pack = packs.find((p) => p.id === parsed.packId);
  if (!pack) return null;
  const item = pack.items.find((it) => it.itemId === parsed.itemId);
  if (!item) return null;
  return { pack, item };
}

export function TrainingDailyPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [packs, setPacks] = useState<TrainingPack[]>([]);
  const [queue, setQueue] = useState<TrainingDailyQueue | null>(null);
  const [stats, setStats] = useState<TrainingItemStats[]>([]);
  const [error, setError] = useState<string | null>(null);

  const date = useMemo(() => todayLocalIsoDate(), []);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setError(null);

    Promise.all([loadBuiltInPacks(), listItemStats()])
      .then(async ([packsRes, statsRes]) => {
        if (!alive) return;
        setPacks(packsRes.packs);
        setStats(statsRes);
        const q = await ensureDailyQueue(packsRes.packs, date, { maxItems: 10, maxNew: 3 });
        if (!alive) return;
        setQueue(q);
        setStatus('ready');
      })
      .catch((e) => {
        if (!alive) return;
        setError((e as Error).message);
        setStatus('error');
      });

    return () => {
      alive = false;
    };
  }, [date]);

  const acc = useMemo(() => overallAccuracy(stats), [stats]);

  return (
    <section className="stack">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Daily queue</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {date}
          </span>
        </div>

        <p className="muted" style={{ marginTop: 6 }}>
          Your daily queue is generated deterministically based on what is due and what you haven’t seen yet.
        </p>

        {acc.attempts > 0 && (
          <p className="muted" style={{ marginTop: 6 }}>
            Overall accuracy: <strong>{Math.round(acc.accuracy * 100)}%</strong> ({acc.successes}/{acc.attempts})
          </p>
        )}

        <div className="actions">
          <Link to="/training" className="btn btn-secondary">
            Back to overview
          </Link>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Today’s items</h3>

        {status === 'loading' && <p className="muted">Building queue…</p>}
        {status === 'error' && <p className="muted">Error: {error ?? 'Unknown error'}</p>}

        {status === 'ready' && (!queue || queue.itemKeys.length === 0) && (
          <p className="muted">No items available. Add packs under public/training/packs/.</p>
        )}

        {status === 'ready' && queue && queue.itemKeys.length > 0 && (
          <ol>
            {queue.itemKeys.map((k) => {
              const found = findItem(packs, k);
              const label = found ? `${found.pack.title} • ${found.item.type}` : k;
              const meta = found ? `themes: ${found.item.themes.join(', ') || '—'} • difficulty: ${found.item.difficulty}` : '';
              return (
                <li key={k} style={{ marginBottom: 10 }}>
                  <div>
                    <strong>{label}</strong>
                  </div>
                  {meta && <div className="muted" style={{ fontSize: 12 }}>{meta}</div>}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
