import { useMemo, useState } from 'react';
import { createLeague, type GameState } from '../game.js';
import type { SaveStore, SaveSlotMeta } from '../storage.js';
import { formatMoney } from '@soccer-tycoon/engine';

const DEFAULT_SEED = 2026;

interface Props {
  store: SaveStore;
  onStart: (seed: number, clubId: string) => void;
  onLoad: (id: string, state: GameState) => void;
}

export function StartScreen({ store, onStart, onLoad }: Props) {
  const [seed] = useState(DEFAULT_SEED);
  const clubs = useMemo(() => createLeague(seed), [seed]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saves, setSaves] = useState<SaveSlotMeta[]>(() => store.list());

  function loadSlot(id: string) {
    const state = store.load(id);
    if (state) onLoad(id, state);
  }

  function deleteSlot(id: string) {
    store.remove(id);
    setSaves(store.list());
  }

  return (
    <div className="start">
      <h1>⚽ Soccer Tycoon</h1>

      {saves.length > 0 && (
        <section className="saves">
          <h2 className="section-title">이어하기</h2>
          <div className="save-list">
            {saves.map((s) => (
              <div key={s.id} className="save-row">
                <div className="save-info">
                  <b>{s.clubName}</b>
                  <span className="muted"> · 시즌 {s.season}</span>
                  <span className="muted save-time">
                    {new Date(s.savedAt).toLocaleString('ko-KR')}
                  </span>
                </div>
                <div className="save-actions">
                  <button className="btn-small" onClick={() => loadSlot(s.id)}>불러오기</button>
                  <button className="btn-small danger" onClick={() => deleteSlot(s.id)}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <h2 className="section-title">새 게임 — 맡을 구단 선택</h2>
      <p className="subtitle">평판이 높을수록 자금과 선수단이 강합니다.</p>
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
