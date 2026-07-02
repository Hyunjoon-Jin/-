import { useState } from 'react';
import { myClub, DIVISION_LABELS, type GameState } from '../game.js';
import { careerScorers, type SeasonSquadEntry } from '@soccer-tycoon/engine';

type HistorySeason = GameState['history'][number];

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

  const leaders = careerScorers(game.clubs, 15);

  const [squadSeason, setSquadSeason] = useState<
    { s: HistorySeason; leagueWon: boolean; cupWon: boolean } | null
  >(null);

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
              <tr><th>시즌</th><th>부</th><th>리그 우승</th><th>컵 우승</th><th>득점왕</th><th>내 순위</th><th></th></tr>
            </thead>
            <tbody>
              {[...seasons].reverse().map((s) => {
                const pos = posOf(s);
                const leagueWon = s.championId === myId;
                const cupWon = s.cupChampionId === myId;
                const hasSquad = (leagueWon || cupWon) && (s.squad?.length ?? 0) > 0;
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
                    <td>
                      {hasSquad && (
                        <button className="btn-small" onClick={() => setSquadSeason({ s, leagueWon, cupWon })}>🏆 스쿼드</button>
                      )}
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

      {leaders.length > 0 && (
        <div className="career-leaders">
          <h3>🥇 현역 통산 득점 순위 <span className="muted small">(전 구단 · 리그+컵)</span></h3>
          <table className="data-table compact">
            <thead>
              <tr><th>#</th><th>선수</th><th>구단</th><th>P</th><th>나이</th><th>출전</th><th>득점</th></tr>
            </thead>
            <tbody>
              {leaders.map((l, i) => (
                <tr key={l.playerId} className={l.clubId === myId ? 'mine' : ''}>
                  <td>{i + 1}</td>
                  <td className="name">{l.name}</td>
                  <td className="small muted">{l.clubName}</td>
                  <td>{l.position}</td>
                  <td>{l.age}</td>
                  <td className="muted">{l.apps}</td>
                  <td><b>{l.goals}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {game.legends.length > 0 && (
        <div className="legends">
          <h3>🕯️ 레전드 명예의 전당 <span className="muted small">(은퇴 선수 · {club.name})</span></h3>
          <table className="data-table compact">
            <thead>
              <tr><th>은퇴 시즌</th><th>선수</th><th>P</th><th>은퇴 나이</th><th>통산 출전</th><th>통산 득점</th><th>A매치</th></tr>
            </thead>
            <tbody>
              {[...game.legends].reverse().map((l) => (
                <tr key={l.playerId}>
                  <td className="muted small">{l.season}</td>
                  <td className="name">{l.name}</td>
                  <td>{l.position}</td>
                  <td>{l.finalAge}</td>
                  <td className="muted">{l.careerApps}</td>
                  <td><b>{l.careerGoals}</b></td>
                  <td className="muted">{l.caps > 0 ? `${l.caps}경` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {squadSeason && (
        <TitleSquadModal
          season={squadSeason.s}
          leagueWon={squadSeason.leagueWon}
          cupWon={squadSeason.cupWon}
          clubName={club.name}
          onClose={() => setSquadSeason(null)}
        />
      )}
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

function TitleSquadModal({
  season, leagueWon, cupWon, clubName, onClose,
}: {
  season: HistorySeason; leagueWon: boolean; cupWon: boolean; clubName: string; onClose: () => void;
}) {
  const squad: SeasonSquadEntry[] = season.squad ?? [];
  const trophies = [leagueWon && '리그', cupWon && '컵'].filter(Boolean).join(' + ');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🏆 시즌 {season.season} 우승 스쿼드 — {clubName}</h2>
          <button className="btn-ghost" onClick={onClose}>닫기 ✕</button>
        </div>
        <p className="muted small">{trophies} 우승 당시 선발 라인업(전술 기준).</p>
        <table className="data-table compact">
          <thead><tr><th>포지션</th><th>선수</th><th>나이</th><th>평균 평점</th><th>득점</th></tr></thead>
          <tbody>
            {squad.map((e) => (
              <tr key={e.playerId}>
                <td className="small muted">{e.position}</td>
                <td className="name">{e.name}</td>
                <td>{e.age}</td>
                <td>{e.avgRating > 0 ? e.avgRating.toFixed(1) : '-'}</td>
                <td>{e.goals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
