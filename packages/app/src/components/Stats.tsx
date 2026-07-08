import { BarChart3 } from 'lucide-react';
import {
  liveTopScorers, liveSquadStats, lastSummary, myClub, type GameState,
} from '../game.js';
import type { PlayerSeasonStat, BestXIEntry, ClubDisciplineRow, MonthlyManagerAward } from '@soccer-tycoon/engine';
import { ratingClass } from '../rating.js';
import { EmptyState } from './EmptyState.js';

export function Stats({ game }: { game: GameState }) {
  // 진행 중이면 라이브 통계, 아니면 지난 시즌 최종 통계
  const live = !!game.live;
  const scorers = live ? liveTopScorers(game, 10) : (lastSummary(game)?.topScorers ?? []);
  const squad = live ? liveSquadStats(game) : lastSeasonSquad(game);
  const awards = live ? null : lastSummary(game)?.awards;
  const fairPlayTable = live ? null : lastSummary(game)?.fairPlayTable;
  const monthlyAwards = live ? null : lastSummary(game)?.monthlyManagerAwards;
  const positionHistory = live ? null : lastSummary(game)?.positionHistory;
  const divisionSize = live ? 0 : (lastSummary(game)?.table.length ?? 0);
  const heading = live ? `시즌 ${game.season} (진행 중)` : lastSummary(game) ? `시즌 ${lastSummary(game)!.season} 최종` : null;

  if (!heading) {
    return (
      <EmptyState
        icon={BarChart3}
        title="아직 통계가 없습니다"
        hint={'"경기" 탭에서 시즌을 시작하면 득점 순위·팀 기록이 쌓입니다.'}
      />
    );
  }

  return (
    <div className="stats">
      <h2>{heading}</h2>

      {awards && (awards.topScorer || awards.topAssist || awards.playerOfSeason || awards.goldenGlove) && (
        <div className="awards">
          {awards.topScorer && (
            <div className="award">
              <div className="award-title">🥇 득점왕</div>
              <div className="award-name">{awards.topScorer.name}</div>
              <div className="muted">{awards.topScorer.clubName} · {awards.topScorer.goals}골</div>
            </div>
          )}
          {awards.topAssist && (
            <div className="award">
              <div className="award-title">🎯 도움왕</div>
              <div className="award-name">{awards.topAssist.name}</div>
              <div className="muted">{awards.topAssist.clubName} · {awards.topAssist.assists}도움</div>
            </div>
          )}
          {awards.playerOfSeason && (
            <div className="award">
              <div className="award-title">⭐ 시즌 베스트</div>
              <div className="award-name">{awards.playerOfSeason.name}</div>
              <div className="muted">{awards.playerOfSeason.clubName} · 평점 {awards.playerOfSeason.avgRating.toFixed(2)}</div>
            </div>
          )}
          {awards.goldenGlove && (
            <div className="award">
              <div className="award-title">🧤 골든글러브</div>
              <div className="award-name">{awards.goldenGlove.name}</div>
              <div className="muted">{awards.goldenGlove.clubName} · 클린시트 {awards.goldenGlove.cleanSheets}회</div>
            </div>
          )}
        </div>
      )}

      {awards?.bestXI && awards.bestXI.length > 0 && <BestXISection entries={awards.bestXI} />}

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

      {positionHistory && positionHistory.length > 1 && divisionSize > 1 && (
        <div>
          <h3>📈 시즌 순위 추이</h3>
          <PositionSparkline history={positionHistory} divisionSize={divisionSize} />
        </div>
      )}

      {fairPlayTable && fairPlayTable.length > 0 && (
        <div>
          <h3>🟨 페어플레이 순위</h3>
          <FairPlayTable rows={fairPlayTable} myClubId={game.myClubId} />
        </div>
      )}

      {monthlyAwards && monthlyAwards.length > 0 && (
        <div>
          <h3>🏆 이달의 감독</h3>
          <MonthlyManagerSection awards={monthlyAwards} myClubId={game.myClubId} />
        </div>
      )}
    </div>
  );
}

/** 시즌 라운드별 내 구단 순위 추이(고도화 항목26) — 1위가 위로 오도록 y축을 뒤집는다. */
function PositionSparkline({ history, divisionSize }: { history: number[]; divisionSize: number }) {
  const w = 320; const h = 64; const padX = 10; const padY = 10;
  const n = history.length;
  const x = (i: number) => padX + (i * (w - 2 * padX)) / (n - 1);
  const y = (pos: number) => padY + ((pos - 1) * (h - 2 * padY)) / Math.max(1, divisionSize - 1);
  const points = history.map((p, i) => `${x(i)},${y(p)}`).join(' ');
  const bestPos = Math.min(...history);
  const bestIdx = history.indexOf(bestPos);
  const lastIdx = n - 1;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="position-sparkline" role="img"
      aria-label={`시즌 순위 추이(${divisionSize}개 구단 중): ${history.join(' → ')}위`}
    >
      <polyline
        points={points} fill="none" stroke="var(--accent)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      />
      {history.map((p, i) => (
        <circle
          key={i} cx={x(i)} cy={y(p)} r={i === bestIdx || i === lastIdx ? 3.5 : 2}
          fill={i === lastIdx ? 'var(--accent-2)' : 'var(--accent)'}
        >
          <title>{`${i + 1}R: ${p}위`}</title>
        </circle>
      ))}
      <text x={x(0)} y={y(history[0]!) - 6} className="sparkline-label" textAnchor="start">
        {history[0]}위
      </text>
      <text x={x(lastIdx)} y={y(history[lastIdx]!) - 6} className="sparkline-label" textAnchor="end">
        최종 {history[lastIdx]}위
      </text>
    </svg>
  );
}

function MonthlyManagerSection({ awards, myClubId }: { awards: MonthlyManagerAward[]; myClubId: string }) {
  return (
    <table className="data-table compact">
      <thead>
        <tr>
          <th>구간</th><th>구단</th><th>승점</th><th>득실차</th>
        </tr>
      </thead>
      <tbody>
        {awards.map((a) => (
          <tr key={a.blockIndex} className={a.clubId === myClubId ? 'mine' : ''}>
            <td className="muted small">{a.fromRound}~{a.toRound}R</td>
            <td className="name">{a.clubName}</td>
            <td><b>{a.points}</b></td>
            <td>{a.gd > 0 ? `+${a.gd}` : a.gd}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FairPlayTable({ rows, myClubId }: { rows: ClubDisciplineRow[]; myClubId: string }) {
  return (
    <table className="data-table compact">
      <thead>
        <tr>
          <th>순위</th><th>구단</th><th>옐로</th><th>레드</th><th>합계</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.clubId} className={r.clubId === myClubId ? 'mine' : ''}>
            <td>{i === 0 ? <span className="rank-gold">1</span> : i + 1}</td>
            <td className="name">{r.clubName}</td>
            <td>{r.yellowCards}</td>
            <td>{r.redCards}</td>
            <td><b>{r.totalCards}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const XI_LINE_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
const XI_LINE_LABEL: Record<string, string> = { GK: 'GK', DEF: '수비', MID: '미드필드', ATT: '공격' };

function xiLineOf(position: string): string {
  if (position === 'GK') return 'GK';
  if (position.startsWith('D')) return 'DEF';
  if (position.startsWith('AM') || position === 'MC' || position === 'DM') return 'MID';
  return 'ATT';
}

function BestXISection({ entries }: { entries: BestXIEntry[] }) {
  const sorted = [...entries].sort((a, b) => (XI_LINE_ORDER[xiLineOf(a.position)] ?? 9) - (XI_LINE_ORDER[xiLineOf(b.position)] ?? 9));
  return (
    <div className="panel best-xi">
      <h3>🌟 이번 시즌 베스트 XI</h3>
      <div className="best-xi-grid">
        {sorted.map((p) => (
          <div key={p.playerId} className="best-xi-card">
            <div className="best-xi-line muted small">{XI_LINE_LABEL[xiLineOf(p.position)]}</div>
            <div className="best-xi-name">{p.name}</div>
            <div className="muted small">{p.clubName}</div>
            <div className="best-xi-stats muted small">
              평점 {p.avgRating.toFixed(2)}
              {p.goals > 0 && <> · {p.goals}골</>}
              {p.assists > 0 && <> · {p.assists}도움</>}
            </div>
          </div>
        ))}
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
          <th>순위</th><th>선수</th>
          {showClub && <th>구단</th>}
          <th>출전</th><th>득점</th><th>도움</th><th>슛</th><th>평점</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => (
          <tr key={s.playerId} className={s.clubId === myClubId ? 'mine' : ''}>
            <td>{i === 0 ? <span className="rank-gold">1</span> : i + 1}</td>
            <td className="name">{s.name}</td>
            {showClub && <td className="muted small">{s.clubName}</td>}
            <td>{s.apps}</td>
            <td><b>{s.goals}</b></td>
            <td>{s.assists}</td>
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
