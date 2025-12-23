import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Small, reusable helper for showing brief user feedback messages ("toasts").
 *
 * We keep this isolated so GamePage doesn't have to manage timers/ref cleanup.
 */
export function useToastNotice(timeoutMs: number = 1500) {
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearNotice = useCallback(() => {
    setNoticeText(null);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showNotice = useCallback(
    (text: string) => {
      setNoticeText(text);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setNoticeText(null), timeoutMs);
    },
    [timeoutMs]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return { noticeText, showNotice, clearNotice };
}
