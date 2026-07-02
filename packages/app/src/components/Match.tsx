import { useState } from 'react';
import {
  liveTable, liveProgress, myNextFixture, lastSummary, myLastPosition,
  myClub, checkMediaEvent, paceCheckpoint, DIVISION_LABELS, type GameState, type MediaEvent,
} from '../game.js';
import type { MatchResult, MediaTone } from '@soccer-tycoon/engine';
import { MatchDetailModal } from './MatchStats.js';
import { MediaInterview } from './MediaInterview.js';

interface Props {
  game: GameState;
  onStartSeason: () => void;
  onPlayRound: () => void;
  onPlayRest: () => void;
  onFinish: () => void;
  onAdvanceFull: () => void;
  onWatch: () => void;
  onMediaRespond: (event: MediaEvent, tone: MediaTone) => void;
  onMediaDismiss: (event: MediaEvent) => void;
}

export function Match(props: Props) {
  const { game } = props;

  if (!game.live) return <Preseason {...props} />;

  const prog = liveProgress(game);
  return prog.over ? <SeasonOver {...props} /> : <InSeason {...props} />;
}

function Preseason({ game, onStartSeason, onAdvanceFull }: Props) {
  const last = lastSummary(game);
  const pos = myLastPosition(game);
  return (
    <div className="match-screen">
      <div className="phase-banner">
        <h2>시즌 {game.season} · 프리시즌</h2>
        {last ? (
          <p className="muted">지난 시즌 {pos}위 · 우승 {last.championName}</p>
        ) : (
          <p className="muted">첫 시즌입니다. 전술 탭에서 라인업을 점검하고 시작하세요.</p>
        )}
      </div>
      <div className="phase-actions">
        <button className="btn-advance" onClick={onStartSeason}>시즌 시작 (이적 창 열기)</button>
        <button className="btn-ghost" onClick={onAdvanceFull}>이번 시즌 한 번에 ▶▶</button>
      </div>
      <p className="hint muted">
        "시즌 시작"을 누르면 AI 구단들이 이적 시장에서 보강하고 일정이 짜입니다.
        이후 라운드 단위로 진행하거나 한 번에 시뮬할 수 있습니다.
      </p>
    </div>
  );
}

const PACE_TEXT: Record<'ahead' | 'onTrack' | 'behind', { icon: string; label: string }> = {
  ahead: { icon: '📈', label: '순항 중' },
  onTrack: { icon: '📊', label: '페이스 유지 중' },
  behind: { icon: '📉', label: '페이스 이탈' },
};

function InSeason(props: Props) {
  const { game, onPlayRound, onPlayRest, onWatch, onMediaRespond, onMediaDismiss } = props;
  const prog = liveProgress(game);
  const next = myNextFixture(game);
  const table = liveTable(game);
  const media = checkMediaEvent(game);
  const predicted = game.live?.predictedTable.find((p) => p.clubId === game.myClubId)?.predictedPos;
  const checkpoint = paceCheckpoint(game);

  return (
    <div className="match-screen">
      <div className="phase-banner">
        <h2>{DIVISION_LABELS[myClub(game).division]} · 시즌 {game.season} · {prog.round}/{prog.total} 라운드</h2>
        {predicted !== undefined && (
          <p className="muted small">📰 언론 예상: <b>{predicted}위</b></p>
        )}
        {next && (
          <p className="next-fixture">
            다음 경기: <b>{game.clubs.find((c) => c.id === game.myClubId)!.name}</b>{' '}
            {next.home ? 'vs' : '@'} <b>{next.opponent.name}</b>{' '}
            <span className="muted">({next.home ? '홈' : '원정'})</span>
            {next.opponent.id === game.rivalClubId && <span className="derby-badge"> 🔥 라이벌전</span>}
          </p>
        )}
      </div>
      {checkpoint && (
        <div className={`pace-checkpoint ${checkpoint.status}`}>
          {PACE_TEXT[checkpoint.status].icon} <b>{PACE_TEXT[checkpoint.status].label}</b> — {checkpoint.round}/{checkpoint.totalRounds}라운드 기준 <b>{checkpoint.position}위</b>
          <span className="muted small"> (목표 {checkpoint.objective}위 이내)</span>
          {checkpoint.rival && (
            <span className="muted small">
              {' · 🔥 '}{checkpoint.rival.name}
              {checkpoint.rival.position === checkpoint.position
                ? '와(과) 동일 순위'
                : checkpoint.rival.position > checkpoint.position
                  ? `보다 ${checkpoint.rival.position - checkpoint.position}계단 위`
                  : `보다 ${checkpoint.position - checkpoint.rival.position}계단 아래`}
            </span>
          )}
        </div>
      )}
      <div className="phase-actions">
        {next && <button className="btn-advance" onClick={onWatch}>내 경기 관전 ▶</button>}
        <button className="btn-ghost" onClick={onPlayRound}>다음 라운드 진행</button>
        <button className="btn-ghost" onClick={onPlayRest}>남은 경기 시뮬 ▶▶</button>
      </div>

      <div className="match-cols">
        <Standings game={game} table={table} />
        <RecentResults game={game} />
      </div>
      {media && (
        <MediaInterview
          event={media}
          onRespond={(tone) => onMediaRespond(media, tone)}
          onDismiss={() => onMediaDismiss(media)}
        />
      )}
    </div>
  );
}

function SeasonOver(props: Props) {
  const { game, onFinish } = props;
  const table = liveTable(game);
  return (
    <div className="match-screen">
      <div className="phase-banner">
        <h2>시즌 {game.season} · 정규 일정 종료</h2>
        <p className="muted">🏆 {table[0]?.name} 우승. 정산하고 다음 시즌으로.</p>
      </div>
      <div className="phase-actions">
        <button className="btn-advance" onClick={onFinish}>시즌 종료 및 정산 ▶</button>
      </div>
      <div className="match-cols">
        <Standings game={game} table={table} />
      </div>
    </div>
  );
}

function Standings({ game, table }: { game: GameState; table: ReturnType<typeof liveTable> }) {
  return (
    <div className="standings">
      <h3>순위표</h3>
      <table className="data-table">
        <thead>
          <tr><th>#</th><th>구단</th><th>경기</th><th>승무패</th><th>득실</th><th>승점</th></tr>
        </thead>
        <tbody>
          {table.map((r, i) => (
            <tr key={r.clubId} className={r.clubId === game.myClubId ? 'mine' : ''}>
              <td>{i + 1}</td>
              <td className="name">{r.name}</td>
              <td>{r.played}</td>
              <td className="muted">{r.won}-{r.drawn}-{r.lost}</td>
              <td>{r.gf - r.ga >= 0 ? '+' : ''}{r.gf - r.ga}</td>
              <td><b>{r.points}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentResults({ game }: { game: GameState }) {
  const live = game.live!;
  const [detail, setDetail] = useState<MatchResult | null>(null);
  if (live.cursor === 0) return <div className="results"><h3>최근 결과</h3><p className="muted">아직 경기가 없습니다.</p></div>;

  const lastRound = live.fixtures[live.cursor - 1]!.round;
  const recent: MatchResult[] = live.results.filter((_, i) => live.fixtures[i]?.round === lastRound);

  return (
    <div className="results">
      <h3>{lastRound}라운드 결과 <span className="muted small">(클릭해 상세)</span></h3>
      <ul className="result-list">
        {recent.map((m, i) => {
          const mine = m.homeClubId === game.myClubId || m.awayClubId === game.myClubId;
          const win =
            (m.homeClubId === game.myClubId && m.score[0] > m.score[1]) ||
            (m.awayClubId === game.myClubId && m.score[1] > m.score[0]);
          const draw = m.score[0] === m.score[1];
          const derby = m.homeClubId === game.rivalClubId || m.awayClubId === game.rivalClubId;
          return (
            <li key={i} className={`clickable ${mine ? (draw ? 'mine draw' : win ? 'mine win' : 'mine loss') : ''}`}
              onClick={() => setDetail(m)}>
              <span className="rl-home">{m.homeClubName}</span>
              <span className="rl-score">{m.score[0]} : {m.score[1]}</span>
              <span className="rl-away">{m.awayClubName}</span>
              {mine && derby && <span className="derby-badge small"> 🔥</span>}
            </li>
          );
        })}
      </ul>
      {detail && <MatchDetailModal result={detail} myClubId={game.myClubId} onClose={() => setDetail(null)} />}
    </div>
  );
}
