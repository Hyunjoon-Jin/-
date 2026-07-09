import {
  currentAbility, marketValue, formatMoney, lineOf, isInjured, isSuspended,
  type Player,
} from '@soccer-tycoon/engine';
import { useModalA11y } from './useModalA11y.js';

interface Props {
  players: Player[];
  onClose: () => void;
}

/** 상태(부상/정지/정상)를 한 줄로. */
function statusText(p: Player): string {
  if (isInjured(p)) return `🤕 부상 (${p.injuryMatches}경기)`;
  if (isSuspended(p)) return `🟥 정지 (${p.suspensionMatches}경기)`;
  return `${Math.round(p.condition * 100)}% 컨디션`;
}

const ROWS: { label: string; render: (p: Player) => string }[] = [
  { label: '포지션', render: (p) => `${p.position} (${lineOf(p.position)})` },
  { label: '나이', render: (p) => `${p.age}세` },
  { label: 'CA', render: (p) => currentAbility(p).toFixed(0) },
  { label: '잠재력', render: (p) => p.potential.toFixed(0) },
  { label: '상태', render: statusText },
  { label: '사기', render: (p) => `${Math.round(p.morale * 100)}%` },
  { label: '계약 잔여', render: (p) => `${p.contractYears}년` },
  { label: '주급', render: (p) => formatMoney(p.wage) },
  { label: '시장가치', render: (p) => formatMoney(marketValue(p)) },
];

/** 선택된 여러 선수를 나란히 비교하는 모달(선수관리 개선 항목13/14) — 스쿼드 목록에서
 *  다중 선택 후 열어, 방출·재계약·전술 결정에 필요한 핵심 지표를 한눈에 대조한다. */
export function PlayerCompareModal({ players, onClose }: Props) {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal compare-modal"
        role="dialog"
        aria-modal="true"
        aria-label="선수 비교"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>⚖ 선수 비교 ({players.length}명)</h2>
          <button className="btn-ghost" onClick={onClose}>닫기 ✕</button>
        </div>
        <div className="table-scroll">
          <table className="data-table compare-table">
            <thead>
              <tr>
                <th>항목</th>
                {players.map((p) => <th key={p.id}>{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <td className="muted">{row.label}</td>
                  {players.map((p) => <td key={p.id}>{row.render(p)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
