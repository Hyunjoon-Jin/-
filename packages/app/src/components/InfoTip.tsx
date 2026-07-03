import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
}

/** 위젯 옆에 붙는 작은 "?" 정보 버튼. 클릭하면 설명 팝오버가 뜨고, 바깥 클릭·Esc로 닫힌다. */
export function InfoTip({ title, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="info-tip" ref={ref}>
      <button
        type="button"
        className="info-tip-btn"
        aria-label={`${title} 도움말`}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      >
        ?
      </button>
      {open && (
        <div className="info-tip-pop" role="tooltip" onClick={(e) => e.stopPropagation()}>
          <b>{title}</b>
          <p>{children}</p>
        </div>
      )}
    </span>
  );
}
