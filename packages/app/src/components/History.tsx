import { useState } from 'react';
import { Landmark } from 'lucide-react';
import { myClub, rivalClub, DIVISION_LABELS, type GameState } from '../game.js';
import { careerScorers, type SeasonSquadEntry } from '@soccer-tycoon/engine';
import { useModalA11y } from './useModalA11y.js';
import { onKeyActivate } from '../a11y.js';
import { EmptyState } from './EmptyState.js';

const RESULT_LABEL: Record<'win' | 'draw' | 'loss', string> = { win: '승', draw: '무', loss: '패' };

type HistorySeason = GameState['history'][number];
type HistoryTab = 'seasons' | 'titles' | 'scorers' | 'legends' | 'rivals';

export function History({ game }: { game: GameState }) {
  const club = myClub(game);
  const seasons = game.history;

  if (seasons.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="아직 완료된 시즌이 없습니다"
        hint="시즌을 마치면 명예의 전당과 역대 기록이 이곳에 쌓입니다."
      />
    );
  }

  const myId = game.myClubId;
  const posOf = (s: (typeof seasons)[number]) => {
    const idx = s.table.findIndex((r) => r.clubId === myId);
    return idx >= 0 ? idx + 1 : undefined;
  };

  // 내 구단 명예 — 1부/2부 우승은 가치가 다르므로(강등된 부에서의 우승과 승격한
  // 부에서의 우승이 동일 취급되면 안 됨) division별로 구분 집계한다.
  const leagueTitlesD0 = seasons.filter((s) => s.championId === myId && s.division === 0).length;
  const leagueTitlesD1 = seasons.filter((s) => s.championId === myId && s.division === 1).length;
  const cupTitles = seasons.filter((s) => s.cupChampionId === myId).length;
  const positions = seasons.map(posOf).filter((p): p is number => p !== undefined);
  const bestFinish = positions.length ? Math.min(...positions) : undefined;
  const demandSeasons = seasons.filter((s) => s.demand);
  const demandsMet = demandSeasons.filter((s) => s.demand!.met).length;
  const sponsorGoalSeasons = seasons.filter((s) => s.sponsorGoal);
  const sponsorGoalsMet = sponsorGoalSeasons.filter((s) => s.sponsorGoal!.met).length;

  // 리그 우승 순위 (구단별, 부별로 별도 집계 — 같은 구단이 1부·2부 모두 우승한
  // 이력을 하나의 숫자로 합치면 서로 다른 무게의 우승이 뒤섞인다).
  const titleCount = new Map<string, { name: string; division: number; count: number }>();
  for (const s of seasons) {
    if (s.division === undefined) continue;
    const key = `${s.championId}-${s.division}`;
    const cur = titleCount.get(key) ?? { name: s.championName, division: s.division, count: 0 };
    cur.count++;
    titleCount.set(key, cur);
  }
  const titleTable = [...titleCount.values()].sort((a, b) => b.count - a.count || a.division - b.division);

  const leaders = careerScorers(game.clubs, 15);

  const [squadSeason, setSquadSeason] = useState<
    { s: HistorySeason; leagueWon: boolean; cupWon: boolean } | null
  >(null);

  const tabDefs: { key: HistoryTab; label: string; show: boolean }[] = [
    { key: 'seasons', label: '역대 시즌', show: true },
    { key: 'titles', label: '리그 우승 순위', show: true },
    { key: 'scorers', label: '통산 득점 순위', show: leaders.length > 0 },
    { key: 'legends', label: '레전드', show: game.legends.length > 0 },
    { key: 'rivals', label: '라이벌전', show: game.rivalMeetings.length > 0 },
  ];
  const availableTabs = tabDefs.filter((t) => t.show);
  const [tab, setTab] = useState<HistoryTab>('seasons');
  const activeTab = availableTabs.some((t) => t.key === tab) ? tab : availableTabs[0]!.key;

  return (
    <div className="history">
      <div className="honors">
        <h2>🏛️ 명예의 전당 — {club.name}</h2>
        <div className="cards">
          <HonorCard title="1부 우승" value={`${leagueTitlesD0}회`} />
          <HonorCard title="2부 우승" value={`${leagueTitlesD1}회`} />
          <HonorCard title="컵 우승" value={`${cupTitles}회`} />
          <HonorCard title="최고 순위" value={bestFinish ? `${bestFinish}위` : '-'} />
          <HonorCard title="치른 시즌" value={`${seasons.length}시즌`} />
          {demandSeasons.length > 0 && (
            <HonorCard title="이사회 요구 달성" value={`${demandsMet}/${demandSeasons.length}`} />
          )}
          {sponsorGoalSeasons.length > 0 && (
            <HonorCard title="스폰서 목표 달성" value={`${sponsorGoalsMet}/${sponsorGoalSeasons.length}`} />
          )}
        </div>
      </div>

      <div className="modal-tabs" role="tablist">
        {availableTabs.map((t) => (
          <button
            key={t.key}
            className={activeTab === t.key ? 'modal-tab active' : 'modal-tab'}
            role="tab"
            aria-selected={activeTab === t.key}
            onClick={() => setTab(t.key)}
            onKeyDown={onKeyActivate(() => setTab(t.key))}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'seasons' && (
        <div>
          <h3>역대 시즌</h3>
          <table className="data-table compact">
            <thead>
              <tr><th>시즌</th><th>부</th><th>리그 우승</th><th>컵 우승</th><th>득점왕</th><th>내 순위</th><th>이사회 요구</th><th>스폰서 목표</th><th></th></tr>
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
                    <td className={`champion name${s.championId === myId ? ' mine' : ''}`}>{s.championName}</td>
                    <td className={s.cupChampionId === myId ? 'mine' : 'muted'}>{s.cupChampionName ?? '-'}</td>
                    <td className="small">{s.awards?.topScorer ? `${s.awards.topScorer.name} (${s.awards.topScorer.goals})` : '-'}</td>
                    <td className={pos === 1 ? 'pos' : ''}>
                      {pos ? `${pos}위` : '-'}
                      {s.promoted && <span className="pos"> ↑</span>}
                      {s.relegated && <span className="neg"> ↓</span>}
                    </td>
                    <td className="small">
                      {s.demand ? (
                        <span className={s.demand.met ? 'pos' : 'neg'} title={s.demand.label}>
                          {s.demand.met ? '달성 ✓' : '실패 ✕'}
                        </span>
                      ) : <span className="muted">-</span>}
                    </td>
                    <td className="small">
                      {s.sponsorGoal ? (
                        <span className={s.sponsorGoal.met ? 'pos' : 'neg'} title={s.sponsorGoal.label}>
                          {s.sponsorGoal.met ? '달성 ✓' : '실패 ✕'}
                        </span>
                      ) : <span className="muted">-</span>}
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
      )}

      {activeTab === 'titles' && (
        <div>
          <h3>리그 우승 순위</h3>
          <table className="data-table compact">
            <thead><tr><th>#</th><th>구단</th><th>부</th><th>우승</th></tr></thead>
            <tbody>
              {titleTable.map((t, i) => (
                <tr key={`${t.name}-${t.division}`} className={t.name === club.name ? 'mine' : ''}>
                  <td>{i === 0 ? <span className="rank-gold">🏆 1</span> : i + 1}</td>
                  <td className="name">{t.name}</td>
                  <td className="small muted">{DIVISION_LABELS[t.division] ?? '-'}</td>
                  <td><b>{t.count}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'scorers' && leaders.length > 0 && (
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

      {activeTab === 'legends' && game.legends.length > 0 && (
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

      {activeTab === 'rivals' && game.rivalMeetings.length > 0 && (
        <div className="rival-history">
          <h3>
            🔥 라이벌전 전적 <span className="muted small">
              ({rivalClub(game).name} · 통산 {game.rivalRecord.wins}승 {game.rivalRecord.draws}무 {game.rivalRecord.losses}패)
            </span>
          </h3>
          <table className="data-table compact">
            <thead><tr><th>시즌</th><th>대회</th><th>홈/원정</th><th>스코어</th><th>결과</th></tr></thead>
            <tbody>
              {[...game.rivalMeetings].reverse().map((m) => (
                <tr key={`${m.season}-${m.competition}-${m.home}`}>
                  <td className="muted small">{m.season}</td>
                  <td className="small muted">{m.competition === 'cup' ? '컵' : '리그'}</td>
                  <td className="small muted">{m.home ? '홈' : '원정'}</td>
                  <td>{m.myGoals} : {m.oppGoals}{m.penalties && <span className="muted small"> (PK)</span>}</td>
                  <td className={m.result === 'win' ? 'pos' : m.result === 'loss' ? 'neg' : ''}>
                    {RESULT_LABEL[m.result]}
                  </td>
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
  const ref = useModalA11y<HTMLDivElement>(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`시즌 ${season.season} 우승 스쿼드 — ${clubName}`}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
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
