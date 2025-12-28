import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadBuiltInPacks } from '../../domain/training/packLoader';
import type { TrainingPack } from '../../domain/training/schema';
import { useToastNotice } from '../game/useToastNotice';
import {
  deleteCustomPack,
  exportCustomPacksBundle,
  importPacksJson,
  listCustomPacks,
  type CustomPackRecord
} from '../../storage/training/customPacksStore';

type Status = 'idle' | 'loading' | 'ready' | 'error';

function downloadJson(filename: string, obj: unknown) {
  const text = JSON.stringify(obj, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function TrainingPacksPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [builtIn, setBuiltIn] = useState<TrainingPack[]>([]);
  const [custom, setCustom] = useState<CustomPackRecord[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { noticeText, showNotice } = useToastNotice(2000);

  const customIds = useMemo(() => new Set(custom.map((c) => c.id)), [custom]);

  async function refresh() {
    setStatus('loading');
    setErrors([]);

    try {
      const [b, c] = await Promise.all([loadBuiltInPacks(), listCustomPacks(500)]);
      setBuiltIn(b.packs);
      setCustom(c);
      const es: string[] = [];
      for (const e of b.errors) es.push(e.message);
      setErrors(es);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      setErrors([(e as Error).message]);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onPickFile(file: File) {
    const text = await file.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      showNotice('Invalid JSON file');
      return;
    }

    try {
      const n = await importPacksJson(raw);
      showNotice(`Imported ${n} pack${n === 1 ? '' : 's'}`);
      await refresh();
    } catch (e) {
      showNotice((e as Error).message);
    }
  }

  return (
    <section className="stack">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ marginTop: 0 }}>Pack management</h3>
          <Link className="btn btn-secondary" to="/training">
            Back
          </Link>
        </div>

        <p className="muted" style={{ marginTop: 6 }}>
          Import your own training packs (JSON), export custom packs, or delete them. Built-in packs are read-only.
        </p>

        <div className="actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            Import pack (.json)
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={custom.length === 0}
            onClick={async () => {
              const bundle = await exportCustomPacksBundle();
              downloadJson('training-custom-packs.json', bundle);
              showNotice('Exported custom packs');
            }}
          >
            Export all custom packs
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onPickFile(f);
            }}
          />
        </div>

        {noticeText && (
          <div className="toast" role="status" aria-live="polite">
            {noticeText}
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Load warnings</h4>
          <ul>
            {errors.map((e, idx) => (
              <li key={idx} className="muted">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h4 style={{ marginTop: 0 }}>Custom packs</h4>

        {status === 'loading' && <p className="muted">Loading…</p>}

        {custom.length === 0 && status !== 'loading' && (
          <p className="muted">No custom packs imported yet.</p>
        )}

        <div className="stack">
          {custom.map((rec) => (
            <div key={rec.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h5 style={{ margin: 0 }}>{rec.pack.title}</h5>
                <span className="muted" style={{ fontSize: 12 }}>
                  id: {rec.id} • v{rec.pack.version}
                </span>
              </div>

              <p className="muted" style={{ marginTop: 6 }}>
                Author: {rec.pack.author} • License: {rec.pack.license}
              </p>

              <div className="actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    downloadJson(`${rec.id}.json`, rec.pack);
                    showNotice('Exported pack');
                  }}
                >
                  Export
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={async () => {
                    await deleteCustomPack(rec.id);
                    showNotice('Deleted pack');
                    await refresh();
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>Built-in packs</h4>
        <p className="muted" style={{ marginTop: 6 }}>
          These ship with the app. You can export them, but you can&apos;t modify them.
        </p>

        <div className="stack">
          {builtIn.map((p) => (
            <div key={p.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h5 style={{ margin: 0 }}>{p.title}</h5>
                <span className="muted" style={{ fontSize: 12 }}>
                  id: {p.id} • v{p.version}
                  {customIds.has(p.id) ? ' • overridden by custom' : ''}
                </span>
              </div>

              <p className="muted" style={{ marginTop: 6 }}>
                Author: {p.author} • License: {p.license}
              </p>

              <div className="actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    downloadJson(`${p.id}.json`, p);
                    showNotice('Exported pack');
                  }}
                >
                  Export
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
