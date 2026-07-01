import { useMemo, useState } from 'react';
import { formatMoney, currentAbility, marketValue, isInjured, isSuspended, type Club, type Player } from '@soccer-tycoon/engine';

type SortKey = 'ca' | 'age' | 'value' | 'wage' | 'condition';

/** 컨디션(0~1)을 색상 점 + %로. 부상은 🤕 N, 정지는 🟥 N. */
function ConditionCell({ player }: { player: Player }) {
  if (isInjured(player)) {
    return <span className="injury">🤕 {player.injuryMatches}</span>;
  }
  if (isSuspended(player)) {
    return <span className="suspended">🟥 {player.suspensionMatches}</span>;
  }
  const pct = Math.round(player.condition * 100);
  const cls = pct >= 80 ? 'cond-good' : pct >= 55 ? 'cond-mid' : 'cond-low';
  return <span className={`cond ${cls}`}>{pct}%</span>;
}

export function Squad({ club }: { club: Club }) {
  const [sort, setSort] = useState<SortKey>('ca');

  const rows = useMemo(() => {
    const withMetrics = club.players.map((p) => ({
      player: p,
      ca: currentAbility(p),
      value: marketValue(p),
    }));
    withMetrics.sort((a, b) => {
      switch (sort) {
        case 'age': return a.player.age - b.player.age;
        case 'value': return b.value - a.value;
        case 'wage': return b.player.wage - a.player.wage;
        case 'condition': return a.player.condition - b.player.condition; // 낮은 순(부상·피로 먼저)
        default: return b.ca - a.ca;
      }
    });
    return withMetrics;
  }, [club.players, sort]);

  return (
    <div className="squad">
      <table className="data-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>포지션</th>
            <SortHeader label="나이" k="age" sort={sort} setSort={setSort} />
            <SortHeader label="CA" k="ca" sort={sort} setSort={setSort} />
            <th>잠재력</th>
            <SortHeader label="컨디션" k="condition" sort={sort} setSort={setSort} />
            <th>국적</th>
            <th>계약</th>
            <SortHeader label="가치" k="value" sort={sort} setSort={setSort} />
            <SortHeader label="주급" k="wage" sort={sort} setSort={setSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ player, ca, value }) => (
            <tr key={player.id}>
              <td className="name">{player.name}</td>
              <td>{player.position}</td>
              <td>{player.age}</td>
              <td><b>{ca.toFixed(0)}</b></td>
              <td className="muted">{player.potential.toFixed(0)}</td>
              <td><ConditionCell player={player} /></td>
              <td className="muted">{player.nationality}</td>
              <td>{player.contractYears}년</td>
              <td>{formatMoney(value)}</td>
              <td className="muted">{formatMoney(player.wage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  label, k, sort, setSort,
}: { label: string; k: SortKey; sort: SortKey; setSort: (k: SortKey) => void }) {
  return (
    <th className={sort === k ? 'sortable active' : 'sortable'} onClick={() => setSort(k)}>
      {label} {sort === k ? '▾' : ''}
    </th>
  );
}
