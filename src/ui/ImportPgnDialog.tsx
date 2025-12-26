import { useEffect, useRef, useState } from 'react';

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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    // focus textarea for quick paste
    setTimeout(() => textareaRef.current?.focus(), 0);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    // allow re-picking the same file
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <h3 className="h3">{title}</h3>

        <p className="muted">
          Paste a PGN (including tags and moves), or choose a .pgn file. The game will be added to your History.
        </p>

        <div className="stack" style={{ gap: 10 }}>
          <div className="actions" style={{ justifyContent: 'space-between' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pgn,text/plain"
              onChange={onPickFile}
              aria-label="Choose PGN file"
            />
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
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onImport(text)}
              disabled={!text.trim()}
            >
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
