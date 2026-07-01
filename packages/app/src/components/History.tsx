import { myClub, DIVISION_LABELS, type GameState } from '../game.js';

export function History({ game }: { game: GameState }) {
  const club = myClub(game);
  const seasons = game.history;

  if (seasons.length === 0) {
    return <p className="muted">아직 완료된 시즌이 없습니다. 시즌을 마치면 역대 기록이 쌓입니다.</p>;
  }

  const myId = game.myClubId;
  const posOf = (s: (typeof seasons)[number]) => {
    const idx = s.table.findIndex((r) => r.clubId === myId);
    return idx >= 0 ? idx + 1 : undefined;
  };

  // 내 구단 명예
  const leagueTitles = seasons.filter((s) => s.championId === myId).length;
  const cupTitles = seasons.filter((s) => s.cupChampionId === myId).length;
  const positions = seasons.map(posOf).filter((p): p is number => p !== undefined);
  const bestFinish = positions.length ? Math.min(...positions) : undefined;

  // 리그 우승 순위 (구단별)
  const titleCount = new Map<string, { name: string; count: number }>();
  for (const s of seasons) {
    const cur = titleCount.get(s.championId) ?? { name: s.championName, count: 0 };
    cur.count++;
    titleCount.set(s.championId, cur);
  }
  const titleTable = [...titleCount.values()].sort((a, b) => b.count - a.count);

  return (
    <div className="history">
      <div className="honors">
        <h2>🏛️ 명예의 전당 — {club.name}</h2>
        <div className="cards">
          <HonorCard title="리그 우승" value={`${leagueTitles}회`} />
          <HonorCard title="컵 우승" value={`${cupTitles}회`} />
          <HonorCard title="최고 순위" value={bestFinish ? `${bestFinish}위` : '-'} />
          <HonorCard title="치른 시즌" value={`${seasons.length}시즌`} />
        </div>
      </div>

      <div className="history-cols">
        <div>
          <h3>역대 시즌</h3>
          <table className="data-table compact">
            <thead>
              <tr><th>시즌</th><th>부</th><th>리그 우승</th><th>컵 우승</th><th>득점왕</th><th>내 순위</th></tr>
            </thead>
            <tbody>
              {[...seasons].reverse().map((s) => {
                const pos = posOf(s);
                return (
                  <tr key={s.season}>
                    <td>{s.season}</td>
                    <td className="small muted">{s.division !== undefined ? DIVISION_LABELS[s.division] : '-'}</td>
                    <td className={s.championId === myId ? 'mine name' : 'name'}>{s.championName}</td>
                    <td className={s.cupChampionId === myId ? 'mine' : 'muted'}>{s.cupChampionName ?? '-'}</td>
                    <td className="small">{s.awards?.topScorer ? `${s.awards.topScorer.name} (${s.awards.topScorer.goals})` : '-'}</td>
                    <td className={pos === 1 ? 'pos' : ''}>
                      {pos ? `${pos}위` : '-'}
                      {s.promoted && <span className="pos"> ↑</span>}
                      {s.relegated && <span className="neg"> ↓</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <h3>리그 우승 순위</h3>
          <table className="data-table compact">
            <thead><tr><th>#</th><th>구단</th><th>우승</th></tr></thead>
            <tbody>
              {titleTable.map((t, i) => (
                <tr key={t.name} className={t.name === club.name ? 'mine' : ''}>
                  <td>{i + 1}</td>
                  <td className="name">{t.name}</td>
                  <td><b>{t.count}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HonorCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
