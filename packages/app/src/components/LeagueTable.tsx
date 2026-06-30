import { lastSummary, type GameState } from '../game.js';

export function LeagueTable({ game }: { game: GameState }) {
  const last = lastSummary(game);

  if (!last) {
    // 시즌 전: 평판 순 프리뷰
    const preview = [...game.clubs].sort((a, b) => b.finance.reputation - a.finance.reputation);
    return (
      <div className="league">
        <p className="muted">아직 경기가 없습니다. 평판 순 프리시즌 전력입니다.</p>
        <table className="data-table">
          <thead><tr><th>#</th><th>구단</th><th>평판</th></tr></thead>
          <tbody>
            {preview.map((c, i) => (
              <tr key={c.id} className={c.id === game.myClubId ? 'mine' : ''}>
                <td>{i + 1}</td>
                <td className="name">{c.name}</td>
                <td>{c.finance.reputation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="league">
      <h2>시즌 {last.season} 최종 순위</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th><th>구단</th><th>경기</th><th>승</th><th>무</th><th>패</th>
            <th>득</th><th>실</th><th>득실</th><th>승점</th>
          </tr>
        </thead>
        <tbody>
          {last.table.map((r, i) => (
            <tr key={r.clubId} className={r.clubId === game.myClubId ? 'mine' : ''}>
              <td>{i + 1}</td>
              <td className="name">{r.name}</td>
              <td>{r.played}</td>
              <td>{r.won}</td>
              <td>{r.drawn}</td>
              <td>{r.lost}</td>
              <td>{r.gf}</td>
              <td>{r.ga}</td>
              <td>{r.gf - r.ga >= 0 ? '+' : ''}{r.gf - r.ga}</td>
              <td><b>{r.points}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
