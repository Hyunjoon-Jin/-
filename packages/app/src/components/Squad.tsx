import { useMemo, useState } from 'react';
import {
  formatMoney, currentAbility, marketValue, isInjured, isSuspended, lineOf,
  type Club, type Player, type Line,
} from '@soccer-tycoon/engine';
import { onKeyActivate } from '../a11y.js';
import { SortableTh } from './SortableTh.js';
import { flagFor } from '../flags.js';

type SortKey = 'ca' | 'age' | 'value' | 'wage' | 'condition';
type SortDir = 1 | -1;
/** 컬럼별 기본 정렬 방향(재클릭 시 이 방향을 뒤집는다). */
const DEFAULT_DIR: Record<SortKey, SortDir> = { ca: -1, age: 1, value: -1, wage: -1, condition: 1 };

type LineFilter = 'ALL' | Line;
const LINE_FILTERS: { key: LineFilter; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'GK', label: 'GK' },
  { key: 'DEF', label: '수비' },
  { key: 'MID', label: '미드' },
  { key: 'ATT', label: '공격' },
];

/** 재계약 임박 기준(renewContract가 허용하는 문턱과 동일 — 2년 이하). */
const CONTRACT_SOON = 2;

/** 컨디션(0~1)을 색상 점 + %로. 부상은 🤕 N, 정지는 🟥 N. */
function ConditionCell({ player }: { player: Player }) {
  if (isInjured(player)) {
    return <span className="injury" title={player.injuryName}>🤕 {player.injuryMatches}</span>;
  }
  if (isSuspended(player)) {
    return <span className="suspended">🟥 {player.suspensionMatches}</span>;
  }
  const pct = Math.round(player.condition * 100);
  const cls = pct >= 80 ? 'cond-good' : pct >= 55 ? 'cond-mid' : 'cond-low';
  return <span className={`cond ${cls}`}>{pct}%</span>;
}

export function Squad({ club, onSelect }: { club: Club; onSelect: (p: Player) => void }) {
  const [sort, setSort] = useState<SortKey>('ca');
  const [dir, setDir] = useState<SortDir>(-1);
  const [line, setLine] = useState<LineFilter>('ALL');
  const [search, setSearch] = useState('');
  const [troubledOnly, setTroubledOnly] = useState(false);
  const [contractSoonOnly, setContractSoonOnly] = useState(false);

  function toggleSort(k: SortKey) {
    if (k === sort) { setDir((d) => (d === 1 ? -1 : 1) as SortDir); return; }
    setSort(k);
    setDir(DEFAULT_DIR[k]);
  }

  const rows = useMemo(() => {
    let list = club.players.map((p) => ({
      player: p,
      ca: currentAbility(p),
      value: marketValue(p),
    }));
    if (line !== 'ALL') list = list.filter((r) => lineOf(r.player.position) === line);
    if (troubledOnly) list = list.filter((r) => isInjured(r.player) || isSuspended(r.player));
    if (contractSoonOnly) list = list.filter((r) => r.player.contractYears <= CONTRACT_SOON);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.player.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let cmp: number;
      switch (sort) {
        case 'age': cmp = a.player.age - b.player.age; break;
        case 'value': cmp = a.value - b.value; break;
        case 'wage': cmp = a.player.wage - b.player.wage; break;
        case 'condition': cmp = a.player.condition - b.player.condition; break;
        default: cmp = a.ca - b.ca;
      }
      return cmp * dir;
    });
    return list;
  }, [club.players, sort, dir, line, troubledOnly, contractSoonOnly, search]);

  return (
    <div className="squad">
      <div className="filters">
        {LINE_FILTERS.map((f) => (
          <button
            key={f.key}
            className={line === f.key ? 'chip active' : 'chip'}
            onClick={() => setLine(f.key)}
          >{f.label}</button>
        ))}
        <button
          className={troubledOnly ? 'chip active' : 'chip'}
          onClick={() => setTroubledOnly((v) => !v)}
        >🤕 부상·정지만</button>
        <button
          className={contractSoonOnly ? 'chip active' : 'chip'}
          onClick={() => setContractSoonOnly((v) => !v)}
        >📋 재계약 임박</button>
      </div>
      <input
        className="search" placeholder="선수 이름 검색…" aria-label="선수 이름 검색"
        value={search} onChange={(e) => setSearch(e.target.value)}
      />

      {rows.length === 0 ? (
        <p className="muted">조건에 맞는 선수가 없습니다.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>번호</th>
              <th>이름</th>
              <th>포지션</th>
              <SortableTh label="나이" k="age" sort={sort} dir={dir} onClick={toggleSort} />
              <SortableTh label="CA" k="ca" sort={sort} dir={dir} onClick={toggleSort} />
              <th>잠재력</th>
              <SortableTh label="컨디션" k="condition" sort={sort} dir={dir} onClick={toggleSort} />
              <th>국적</th>
              <th>계약</th>
              <SortableTh label="가치" k="value" sort={sort} dir={dir} onClick={toggleSort} />
              <SortableTh label="주급" k="wage" sort={sort} dir={dir} onClick={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player, ca, value }) => (
              <tr
                key={player.id}
                className="clickable"
                onClick={() => onSelect(player)}
                role="button"
                tabIndex={0}
                onKeyDown={onKeyActivate(() => onSelect(player))}
              >
                <td className="squad-number muted">{player.squadNumber ?? '-'}</td>
                <td className="name">{player.name}</td>
                <td><span className={`pos-chip pos-${lineOf(player.position).toLowerCase()}`}>{player.position}</span></td>
                <td>{player.age}</td>
                <td><b>{ca.toFixed(0)}</b></td>
                <td className="muted">{player.potential.toFixed(0)}</td>
                <td><ConditionCell player={player} /></td>
                <td className="muted">{flagFor(player.nationality)} {player.nationality}</td>
                <td className={player.contractYears <= CONTRACT_SOON ? 'neg' : ''}>{player.contractYears}년</td>
                <td>{formatMoney(value)}</td>
                <td className="muted">{formatMoney(player.wage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
