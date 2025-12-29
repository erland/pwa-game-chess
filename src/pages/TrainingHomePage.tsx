import { useEffect, useMemo, useState } from 'react';
import { loadAllPacks, type PackLoadError } from '../domain/training/packLoader';
import type { TrainingItemType, TrainingPack } from '../domain/training/schema';

type Status = 'idle' | 'loading' | 'ready' | 'error';

function countByType(pack: TrainingPack): Record<TrainingItemType, number> {
  const out: Record<TrainingItemType, number> = { tactic: 0, openingLine: 0, endgame: 0, lesson: 0 };
  for (const it of pack.items) out[it.type]++;
  return out;
}

export function TrainingHomePage() {
  const [status, setStatus] = useState<Status>('idle');
  const [packs, setPacks] = useState<TrainingPack[]>([]);
  const [errors, setErrors] = useState<PackLoadError[]>([]);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    loadAllPacks()
      .then((res) => {
        if (!alive) return;
        setPacks(res.packs);
        setErrors(res.errors);
        setStatus('ready');
      })
      .catch((e) => {
        if (!alive) return;
        setPacks([]);
        setErrors([{ message: (e as Error).message }]);
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  const packRows = useMemo(() => {
    return packs.map((p) => {
      const counts = countByType(p);
      return { pack: p, counts };
    });
  }, [packs]);

  return (
    <section className="stack">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Available training packs</h3>

        {status === 'loading' && <p className="muted">Loading packs…</p>}

        {errors.length > 0 && (
          <div className="stack" style={{ gap: 10 }}>
            <p className="muted">Some packs failed to load:</p>
            <ul>
              {errors.map((e, idx) => (
                <li key={idx}>
                  <code>{e.packId ?? e.file ?? 'pack'}</code>: {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {status !== 'loading' && packRows.length === 0 && (
          <p className="muted">No packs found. Add files under public/training/packs/ and update index.json.</p>
        )}

        {packRows.length > 0 && (
          <div className="stack">
            {packRows.map(({ pack, counts }) => (
              <div key={pack.id} className="card">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h4 style={{ margin: 0 }}>{pack.title}</h4>
                  <span className="muted" style={{ fontSize: 12 }}>
                    v{pack.version}
                  </span>
                </div>

                <p className="muted" style={{ marginTop: 6 }}>
                  Tags: {pack.tags.join(', ') || '—'}
                </p>

                <p className="muted" style={{ marginTop: 6 }}>
                  Items: {pack.items.length} (tactics {counts.tactic}, openings {counts.openingLine}, endgames{' '}
                  {counts.endgame}, lessons {counts.lesson})
                </p>

                <p className="muted" style={{ marginTop: 6 }}>
                  Author: {pack.author} • License: {pack.license}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
