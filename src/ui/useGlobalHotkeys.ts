import { useEffect, useRef } from 'react';

export type Hotkey = {
  key: string; // e.g. 'h', 'n'
  onKey: () => void;
  preventDefault?: boolean;
  allowInInput?: boolean;
};

/**
 * Global keyboard shortcuts helper.
 * - Ignores keypresses when focus is in an input/textarea/select by default.
 * - Ignores modified shortcuts (Ctrl/Alt/Meta) to avoid clobbering browser shortcuts.
 */
export function useGlobalHotkeys(hotkeys: readonly Hotkey[], deps: unknown[] = []) {
  // Avoid re-registering the global keydown listener on every render.
  // Keep the latest hotkeys in a ref that the single listener reads.
  const hotkeysRef = useRef<readonly Hotkey[]>(hotkeys);

  useEffect(() => {
    hotkeysRef.current = hotkeys;
  }, [hotkeys]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isTypingTarget = (t: unknown): boolean => {
      const el = t as any;
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e: any) => {
      if (!e) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const key = String(e.key || '').toLowerCase();
      const list = hotkeysRef.current;
      for (const hk of list) {
        if (String(hk.key).toLowerCase() !== key) continue;

        if (!hk.allowInInput && isTypingTarget(e.target)) return;

        if (hk.preventDefault !== false) {
          e.preventDefault?.();
        }
        hk.onKey();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps]);
}
