import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * 모달 공통 접근성 처리: 열릴 때 포커스 진입, Tab 포커스 트랩,
 * Escape로 닫기(onClose가 있을 때만), 닫힐 때 이전 포커스 복원.
 */
export function useModalA11y<T extends HTMLElement>(onClose?: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    (focusables()[0] ?? node)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      prevFocused?.focus?.();
    };
  }, [onClose]);

  return ref;
}
