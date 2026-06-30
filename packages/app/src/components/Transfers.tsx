import { lastSummary, type GameState } from '../game.js';
import { formatMoney } from '@soccer-tycoon/engine';

export function Transfers({ game }: { game: GameState }) {
  const last = lastSummary(game);

  if (!last) {
    return <p className="muted">아직 이적 시장이 열리지 않았습니다. 시즌을 진행하세요.</p>;
  }

  if (last.transfers.length === 0) {
    return <p className="muted">시즌 {last.season} 이적 시장에서 성사된 이적이 없습니다.</p>;
  }

  return (
    <div className="transfers">
      <h2>시즌 {last.season} 이적 시장 ({last.transfers.length}건)</h2>
      <table className="data-table">
        <thead>
          <tr><th>선수</th><th>포지션</th><th>이적</th><th>이적료</th></tr>
        </thead>
        <tbody>
          {last.transfers.map((d, i) => {
            const involvesMe = d.toClubId === game.myClubId || d.fromClubId === game.myClubId;
            return (
              <tr key={i} className={involvesMe ? 'mine' : ''}>
                <td className="name">{d.playerName}</td>
                <td>{d.position}</td>
                <td>
                  {d.fromClubName} <span className="arrow">→</span> <b>{d.toClubName}</b>
                </td>
                <td>{formatMoney(d.fee)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
