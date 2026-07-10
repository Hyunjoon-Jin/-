import { useEffect, useRef, useState, type MouseEvent } from 'react';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/** 목록 행 우클릭 컨텍스트 메뉴(선수관리 개선 항목47) — 상태(위치·항목)와 열기/닫기만 다루고,
 *  실제 렌더링은 ContextMenu 컴포넌트가 맡는다. */
export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  function open(e: MouseEvent, items: ContextMenuItem[]) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }
  function close() {
    setMenu(null);
  }

  return { menu, open, close };
}

export function ContextMenu({ menu, onClose }: { menu: ContextMenuState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    function onDocClick() {
      onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    // 캡처 단계에서 열자마자 발생한 contextmenu 이벤트 자체가 곧바로 닫아버리지 않도록
    // 다음 이벤트 루프 틱부터 바깥 클릭 리스너를 건다.
    const id = setTimeout(() => {
      document.addEventListener('click', onDocClick);
      document.addEventListener('contextmenu', onDocClick);
    }, 0);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('contextmenu', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  // 화면 밖으로 나가지 않도록 뷰포트 안쪽으로 위치 보정.
  const style = {
    left: Math.min(menu.x, window.innerWidth - 200),
    top: Math.min(menu.y, window.innerHeight - menu.items.length * 34 - 16),
  };

  return (
    <div className="context-menu" style={style} ref={ref} role="menu">
      {menu.items.map((item, i) => (
        <button
          key={i}
          className={item.danger ? 'context-menu-item danger' : 'context-menu-item'}
          role="menuitem"
          onClick={() => { item.onClick(); onClose(); }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
