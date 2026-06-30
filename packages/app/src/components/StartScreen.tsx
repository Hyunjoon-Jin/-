import { useMemo, useState } from 'react';
import { createLeague } from '../game.js';
import { formatMoney } from '@soccer-tycoon/engine';

const DEFAULT_SEED = 2026;

export function StartScreen({ onStart }: { onStart: (seed: number, clubId: string) => void }) {
  const [seed] = useState(DEFAULT_SEED);
  const clubs = useMemo(() => createLeague(seed), [seed]);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="start">
      <h1>⚽ Soccer Tycoon</h1>
      <p className="subtitle">맡을 구단을 선택하세요. 평판이 높을수록 자금과 선수단이 강합니다.</p>
      <div className="club-grid">
        {clubs.map((c) => (
          <button
            key={c.id}
            className={selected === c.id ? 'club-card selected' : 'club-card'}
            onClick={() => setSelected(c.id)}
          >
            <div className="club-card-name">{c.name}</div>
            <div className="club-card-row">평판 <b>{c.finance.reputation}</b></div>
            <div className="club-card-row">자금 {formatMoney(c.finance.balance)}</div>
            <div className="club-card-row muted">선수 {c.players.length}명</div>
          </button>
        ))}
      </div>
      <button
        className="btn-primary"
        disabled={!selected}
        onClick={() => selected && onStart(seed, selected)}
      >
        이 구단으로 시작
      </button>
    </div>
  );
}
