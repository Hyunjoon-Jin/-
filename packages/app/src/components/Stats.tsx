import {
  liveTopScorers, liveSquadStats, lastSummary, myClub, type GameState,
} from '../game.js';
import type { PlayerSeasonStat } from '@soccer-tycoon/engine';
import { ratingClass } from '../rating.js';

export function Stats({ game }: { game: GameState }) {
  // 진행 중이면 라이브 통계, 아니면 지난 시즌 최종 통계
  const live = !!game.live;
  const scorers = live ? liveTopScorers(game, 10) : (lastSummary(game)?.topScorers ?? []);
  const squad = live ? liveSquadStats(game) : lastSeasonSquad(game);
  const awards = live ? null : lastSummary(game)?.awards;
  const heading = live ? `시즌 ${game.season} (진행 중)` : lastSummary(game) ? `시즌 ${lastSummary(game)!.season} 최종` : null;

  if (!heading) {
    return <p className="muted">아직 통계가 없습니다. "경기" 탭에서 시즌을 시작하세요.</p>;
  }

  return (
    <div className="stats">
      <h2>{heading}</h2>

      {awards && (awards.topScorer || awards.playerOfSeason) && (
        <div className="awards">
          {awards.topScorer && (
            <div className="award">
              <div className="award-title">🥇 득점왕</div>
              <div className="award-name">{awards.topScorer.name}</div>
              <div className="muted">{awards.topScorer.clubName} · {awards.topScorer.goals}골</div>
            </div>
          )}
          {awards.playerOfSeason && (
            <div className="award">
              <div className="award-title">⭐ 시즌 베스트</div>
              <div className="award-name">{awards.playerOfSeason.name}</div>
              <div className="muted">{awards.playerOfSeason.clubName} · 평점 {awards.playerOfSeason.avgRating.toFixed(2)}</div>
            </div>
          )}
        </div>
      )}

      <div className="stats-cols">
        <div>
          <h3>득점 순위</h3>
          <ScorerTable rows={scorers} myClubId={game.myClubId} />
        </div>
        <div>
          <h3>내 구단 ({myClub(game).name}) 시즌 기록</h3>
          <ScorerTable rows={squad.slice(0, 14)} myClubId={game.myClubId} showClub={false} />
        </div>
      </div>
    </div>
  );
}

function ScorerTable({
  rows, myClubId, showClub = true,
}: { rows: PlayerSeasonStat[]; myClubId: string; showClub?: boolean }) {
  if (rows.length === 0) return <p className="muted small">기록 없음</p>;
  return (
    <table className="data-table compact">
      <thead>
        <tr>
          <th>선수</th>
          {showClub && <th>구단</th>}
          <th>출전</th><th>득점</th><th>슛</th><th>평점</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.playerId} className={s.clubId === myClubId ? 'mine' : ''}>
            <td className="name">{s.name}</td>
            {showClub && <td className="muted small">{s.clubName}</td>}
            <td>{s.apps}</td>
            <td><b>{s.goals}</b></td>
            <td className="muted">{s.shots}</td>
            <td className={ratingClass(s.avgRating)}>{s.avgRating.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 지난 시즌 내 구단 선수 통계(어워드 시점 topScorers엔 일부만 있으므로 재집계 불가 →
 *  지난 시즌은 topScorers 중 내 구단만 보여준다). */
function lastSeasonSquad(game: GameState): PlayerSeasonStat[] {
  const last = lastSummary(game);
  if (!last?.topScorers) return [];
  return last.topScorers
    .filter((s) => s.clubId === game.myClubId)
    .sort((a, b) => b.avgRating - a.avgRating);
}
