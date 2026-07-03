import type { KeyboardEvent } from 'react';

/** Enter/Space로 클릭 가능한 비-버튼 요소(tr/td/th 등)를 키보드로도 활성화한다. */
export function onKeyActivate(handler: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  };
}
