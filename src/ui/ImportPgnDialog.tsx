import { useEffect, useId, useRef, useState } from 'react';

export type ImportPgnDialogProps = {
  title?: string;
  initialText?: string;
  onImport: (pgnText: string) => void;
  onCancel: () => void;
};

export function ImportPgnDialog({
  title = 'Import PGN',
  initialText = '',
  onImport,
  onCancel
}: ImportPgnDialogProps) {
  const [text, setText] = useState(initialText);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    // focus textarea for quick paste
    const t = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      setText(content);
    } finally {
      // allow re-picking the same file
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const root = modalRef.current;
    if (!root) return;

    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    }
  }

  return (
    <div
      className="modalBackdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onMouseDown={(e) => {
        // Clicking the backdrop cancels.
        if (e.currentTarget === e.target) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div
        ref={modalRef}
        className="modal"
        style={{ maxWidth: 760 }}
        onKeyDown={(e) => {
          trapTab(e);
        }}
      >
        <h3 id={titleId} className="h3">
          {title}
        </h3>

        <p id={descId} className="muted">
          Paste a PGN (including tags and moves), or choose a .pgn file. The game will be added to your History.
        </p>

        <div className="stack" style={{ gap: 10 }}>
          <div className="actions" style={{ justifyContent: 'space-between' }}>
            <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Choose file
              <input
                ref={fileInputRef}
                type="file"
                accept=".pgn,text/plain"
                onChange={onPickFile}
                aria-label="Choose PGN file"
                className="visuallyHiddenFileInput"
              />
            </label>

            <button type="button" className="btn btn-secondary" onClick={() => setText('')}>
              Clear
            </button>
          </div>

          <textarea
            ref={textareaRef}
            className="textarea"
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='[Event "…"]\n[Site "…"]\n...\n1. e4 e5 2. Nf3 Nc6 ... 1-0'
            aria-label="PGN input"
          />

          <div className="actions" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel} aria-label="Cancel import">
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onImport(text)}
              disabled={!text.trim()}
              aria-label="Import PGN"
            >
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
