import { useMemo, useState } from 'react';
import { createLeague, DIFFICULTIES, DIVISION_LABELS, type Difficulty, type GameState } from '../game.js';
import type { SaveStore, SaveSlotMeta } from '../storage.js';
import { loadCareer, type CareerStint } from '../career.js';
import { formatMoney } from '@soccer-tycoon/engine';
import { ConfirmDialog } from './ConfirmDialog.js';

const DEFAULT_SEED = 2026;
const DIFF_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];

interface Props {
  store: SaveStore;
  onStart: (seed: number, clubId: string, difficulty: Difficulty) => void;
  onLoad: (id: string, state: GameState) => void;
}

export function StartScreen({ store, onStart, onLoad }: Props) {
  const [seed] = useState(DEFAULT_SEED);
  const clubs = useMemo(() => createLeague(seed), [seed]);
  const [selected, setSelected] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [saves, setSaves] = useState<SaveSlotMeta[]>(() => {
    try {
      return store.list();
    } catch (err) {
      console.error('세이브 목록을 불러오지 못했습니다:', err);
      return [];
    }
  });
  const career = useMemo<CareerStint[]>(() => {
    try {
      return loadCareer();
    } catch (err) {
      console.error('커리어 기록을 불러오지 못했습니다:', err);
      return [];
    }
  }, []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SaveSlotMeta | null>(null);

  function loadSlot(id: string) {
    setLoadError(null);
    try {
      const state = store.load(id);
      if (state) {
        onLoad(id, state);
        return;
      }
      // load()가 null을 반환 — 손상됐거나 호환되지 않는(구버전) 세이브. 조용히
      // 무시하면 고아 슬롯이 목록에 영구히 남아 클릭할 때마다 똑같이 무반응하므로,
      // 사용자에게 알리고 목록에서 제거한다.
      setLoadError('이 세이브를 불러올 수 없습니다(손상되었거나 호환되지 않는 버전). 목록에서 제거합니다.');
      store.remove(id);
      setSaves(store.list());
    } catch (err) {
      console.error('세이브를 불러오지 못했습니다:', err);
      setLoadError('이 세이브를 불러오는 중 오류가 발생했습니다.');
    }
  }

  function deleteSlot(id: string) {
    try {
      store.remove(id);
      setSaves(store.list());
    } catch (err) {
      console.error('세이브 삭제에 실패했습니다:', err);
    }
    setDeleteTarget(null);
  }

  return (
    <div className="start">
      <h1>⚽ Soccer Tycoon</h1>
      {loadError && <p className="toast err">{loadError}</p>}

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
                  <button className="btn-small danger" onClick={() => setDeleteTarget(s)}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {career.length > 0 && (
        <section className="career-archive">
          <h2 className="section-title">🎖️ 감독 커리어</h2>
          <p className="subtitle">지금까지 경질로 끝난 재임 기록입니다. 세이브와 무관하게 영구 보존됩니다.</p>
          <table className="data-table compact">
            <thead>
              <tr><th>구단</th><th>재임 시즌</th><th>최고 순위</th><th>리그 우승</th><th>컵 우승</th><th>경질일</th></tr>
            </thead>
            <tbody>
              {[...career].reverse().map((c, i) => (
                <tr key={i}>
                  <td className="name">{c.clubName}</td>
                  <td>{c.seasons}시즌</td>
                  <td>{c.bestFinish ? `${c.bestFinish}위` : '-'}</td>
                  <td className={c.leagueTitles > 0 ? 'pos' : 'muted'}>{c.leagueTitles}회</td>
                  <td className={c.cupTitles > 0 ? 'pos' : 'muted'}>{c.cupTitles}회</td>
                  <td className="muted small">{new Date(c.endedAt).toLocaleDateString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <h2 className="section-title">새 게임 — 난이도</h2>
      <div className="diff-row">
        {DIFF_ORDER.map((d) => (
          <button
            key={d}
            className={difficulty === d ? 'diff-card active' : 'diff-card'}
            onClick={() => setDifficulty(d)}
          >
            <div className="diff-label">{DIFFICULTIES[d].label}</div>
            <div className="diff-desc muted">{DIFFICULTIES[d].desc}</div>
          </button>
        ))}
      </div>

      <h2 className="section-title">맡을 구단 선택</h2>
      <p className="subtitle">1부는 강하지만 잔류가 목표, 2부는 약하지만 승격을 노립니다.</p>
      {[0, 1].map((div) => (
        <div key={div}>
          <h3 className="section-title">{DIVISION_LABELS[div]}</h3>
          <div className="club-grid">
            {clubs.filter((c) => c.division === div).map((c) => (
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
        </div>
      ))}
      <button
        className="btn-primary"
        disabled={!selected}
        onClick={() => selected && onStart(seed, selected, difficulty)}
      >
        이 구단으로 시작 ({DIFFICULTIES[difficulty].label})
      </button>

      {deleteTarget && (
        <ConfirmDialog
          title="세이브 삭제"
          message={`${deleteTarget.clubName} (시즌 ${deleteTarget.season}) 세이브를 삭제하시겠습니까? 되돌릴 수 없습니다.`}
          confirmLabel="삭제"
          danger
          onConfirm={() => deleteSlot(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
