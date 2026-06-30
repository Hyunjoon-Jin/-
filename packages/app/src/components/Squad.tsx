import { useMemo, useState } from 'react';
import { formatMoney, currentAbility, marketValue, type Club, type Player } from '@soccer-tycoon/engine';

type SortKey = 'ca' | 'age' | 'value' | 'wage';

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
