import { useEffect, useId, useRef } from 'react';

export type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Optional ARIA label for the confirm button (useful when multiple "Delete" buttons exist). */
  confirmAriaLabel?: string;
  /** Optional ARIA label for the cancel button. */
  cancelAriaLabel?: string;
  /** Which button should receive focus when the dialog opens. Default: cancel */
  initialFocus?: 'cancel' | 'confirm';
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Simple modal confirm dialog.
 *
 * Notes:
 * - Avoids window.confirm() so the flow is testable.
 * - Adds basic focus management + a light focus trap for accessibility.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmAriaLabel,
  cancelAriaLabel,
  initialFocus = 'cancel',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const titleId = useId();
  const msgId = useId();
  const modalRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Focus an action button on open (avoid leaving focus behind the modal).
    const t = window.setTimeout(() => {
      const target = initialFocus === 'confirm' ? confirmRef.current : cancelRef.current;
      target?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [initialFocus]);

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
      aria-describedby={msgId}
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
        onKeyDown={(e) => {
          trapTab(e);
        }}
      >
        <h3 id={titleId} className="h3">
          {title}
        </h3>
        <p id={msgId} className="muted">
          {message}
        </p>

        <div className="actions" style={{ marginTop: 12 }}>
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            aria-label={cancelAriaLabel ?? cancelLabel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            aria-label={confirmAriaLabel ?? confirmLabel}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
