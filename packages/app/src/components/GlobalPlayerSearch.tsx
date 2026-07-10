import { useMemo, useState } from 'react';
import { currentAbility, lineOf, type Club, type Player } from '@soccer-tycoon/engine';
import { onKeyActivate } from '../a11y.js';
import { useModalA11y } from './useModalA11y.js';

interface Props {
  club: Club;
  onSelect: (p: Player) => void;
  onClose: () => void;
}

/** 전역 선수 검색(선수관리 개선 항목42) — 현재 화면(탭)과 무관하게 내 스쿼드(1군+리저브)
 *  전체에서 선수를 바로 찾아 상세 모달을 연다. 헤더의 검색 버튼으로 어디서든 열 수 있다. */
export function GlobalPlayerSearch({ club, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const ref = useModalA11y<HTMLDivElement>(onClose);

  const results = useMemo(() => {
    const all = [...club.players, ...(club.reserves ?? [])];
    const q = query.trim().toLowerCase();
    const list = q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
    return [...list].sort((a, b) => currentAbility(b) - currentAbility(a)).slice(0, 20);
  }, [club, query]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal global-search-modal" role="dialog" aria-modal="true"
        aria-label="전역 선수 검색" tabIndex={-1} ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>🔎 선수 검색</h2>
          <button className="btn-ghost" onClick={onClose}>닫기 ✕</button>
        </div>
        <input
          className="search global-search-input" placeholder="선수 이름 검색… (1군+리저브)"
          aria-label="전역 선수 이름 검색"
          value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
        />
        {results.length === 0 ? (
          <p className="muted">일치하는 선수가 없습니다.</p>
        ) : (
          <ul className="global-search-list">
            {results.map((p) => (
              <li
                key={p.id}
                className="clickable global-search-item"
                onClick={() => onSelect(p)}
                role="button" tabIndex={0}
                onKeyDown={onKeyActivate(() => onSelect(p))}
              >
                <span className={`pos-chip pos-${lineOf(p.position).toLowerCase()}`}>{p.position}</span>
                <span className="name">{p.name}</span>
                <span className="muted small">{p.age}세</span>
                <b>{currentAbility(p).toFixed(0)}</b>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
