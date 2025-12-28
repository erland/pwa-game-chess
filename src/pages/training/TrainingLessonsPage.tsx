import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import type { LessonItem, TrainingPack } from '../../domain/training/schema';
import { loadBuiltInPacks } from '../../domain/training/packLoader';
import { makeItemKey, type TrainingItemKey } from '../../domain/training/keys';
import { listLessonProgress, type LessonProgressRecord } from '../../storage/training/lessonProgressStore';

type Status = 'idle' | 'loading' | 'ready' | 'error';

type LessonRef = {
  key: TrainingItemKey;
  pack: TrainingPack;
  item: LessonItem;
  progress: LessonProgressRecord | null;
};

function isLesson(it: any): it is LessonItem {
  return it && typeof it === 'object' && it.type === 'lesson' && typeof it.itemId === 'string';
}

export function TrainingLessonsPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [packs, setPacks] = useState<TrainingPack[]>([]);
  const [progress, setProgress] = useState<LessonProgressRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setError(null);

    Promise.all([loadBuiltInPacks(), listLessonProgress(200)])
      .then(([packsRes, prog]) => {
        if (!alive) return;
        setPacks(packsRes.packs);
        setProgress(prog);
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
  }, []);

  const focusKey = params.get('focus');

  const lessons = useMemo<LessonRef[]>(() => {
    const map = new Map(progress.map((p) => [p.key, p]));
    const out: LessonRef[] = [];
    for (const p of packs) {
      for (const it of p.items) {
        if (!isLesson(it)) continue;
        const key = makeItemKey(p.id, it.itemId);
        out.push({ key, pack: p, item: it, progress: map.get(key) ?? null });
      }
    }

    // Sort: focused first, then incomplete, then most recently updated.
    out.sort((a, b) => {
      const af = focusKey && a.key === focusKey ? 1 : 0;
      const bf = focusKey && b.key === focusKey ? 1 : 0;
      if (af !== bf) return bf - af;
      const ac = a.progress?.completedAtMs ? 1 : 0;
      const bc = b.progress?.completedAtMs ? 1 : 0;
      if (ac !== bc) return ac - bc;
      const au = a.progress?.updatedAtMs ?? 0;
      const bu = b.progress?.updatedAtMs ?? 0;
      return (bu - au) || a.key.localeCompare(b.key);
    });

    return out;
  }, [packs, progress, focusKey]);

  return (
    <section className="stack">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Lessons</h3>
        <p className="muted" style={{ marginTop: 6 }}>
          Guided lessons mix text, diagrams, and interactive “try the move” prompts. Your place is saved locally so you can continue later.
        </p>
        <div className="actions">
          <Link to="/training" className="btn btn-secondary">
            Back to overview
          </Link>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Available lessons</h3>

        {status === 'loading' && <p className="muted">Loading lessons…</p>}
        {status === 'error' && <p className="muted">Error: {error ?? 'Unknown error'}</p>}

        {status === 'ready' && lessons.length === 0 && <p className="muted">No lessons found in built-in packs.</p>}

        {status === 'ready' && lessons.length > 0 && (
          <div className="stack">
            {lessons.map((l) => {
              const completed = !!l.progress?.completedAtMs;
              const block = l.progress?.currentBlockIndex ?? 0;
              return (
                <div key={l.key} className="card">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h4 style={{ margin: 0 }}>{l.item.title ?? `Lesson ${l.item.itemId}`}</h4>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {l.pack.title}
                    </span>
                  </div>

                  <p className="muted" style={{ marginTop: 6 }}>
                    {completed ? 'Completed' : `Continue at step ${block + 1}`}
                  </p>

                  <div className="actions">
                    <Link to={`/training/lessons/${encodeURIComponent(l.pack.id)}/${encodeURIComponent(l.item.itemId)}`} className="btn btn-primary">
                      {completed ? 'Review' : l.progress ? 'Continue' : 'Start'}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
