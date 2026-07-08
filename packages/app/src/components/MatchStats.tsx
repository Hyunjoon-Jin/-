import type { MatchResult, PlayerMatchStat } from '@soccer-tycoon/engine';
import { useModalA11y } from './useModalA11y.js';
import { ratingClass } from '../rating.js';

/**
 * 득점 타임라인 + MOTM + 카드(고도화 항목35) — 엔진이 이미 계산해 두는
 * result.events/motmPlayerId/cards를 지난 경기 다시보기(MatchDetailModal)에서도
 * 노출한다. 실시간 관전(WatchMatch)의 풀타임 패널은 이미 별도로 이 정보를
 * 보여주고 있어 중복을 피하고자 여기서만 렌더링한다.
 */
function MatchHighlights({ result }: { result: MatchResult }) {
  const goals = result.events.filter((e) => e.outcome === 'GOAL');
  const motm = [...result.playerStats.home, ...result.playerStats.away]
    .find((s) => s.playerId === result.motmPlayerId);
  return (
    <div className="mstats-highlights">
      {motm && <p className="ft-motm">🏅 맨오브더매치 — <b>{motm.name}</b> ({motm.rating.toFixed(1)})</p>}
      {goals.length > 0 && (
        <ul className="goal-timeline">
          {goals.map((g) => (
            <li key={`${g.minute}-${g.playerId}`}>
              <span className="feed-min">{g.minute}'</span>
              <span>⚽ {g.playerName}{g.assistPlayerName ? ` (도움 ${g.assistPlayerName})` : ''}</span>
            </li>
          ))}
        </ul>
      )}
      {result.cards.length > 0 && (
        <ul className="card-list">
          {result.cards.map((c) => (
            <li key={`${c.minute}-${c.playerId}-${c.type}`}>
              <span className="feed-min">{c.minute}'</span>
              <span>{c.type === 'red' ? '🟥' : '🟨'} {c.playerName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 경기 상세 통계 본문 (점유율·슈팅·선수 평점). */
export function MatchStats({ result, myClubId }: { result: MatchResult; myClubId?: string }) {
  const [hp, ap] = result.possession;
  const [hs, as] = result.shots;
  const mine = (id: string) => id === myClubId;

  return (
    <div className="mstats">
      <StatBar label="점유율" home={`${hp}%`} away={`${ap}%`} homePct={hp} />
      <StatBar label="슈팅" home={`${hs}`} away={`${as}`} homePct={hs + as === 0 ? 50 : (hs / (hs + as)) * 100} />

      <div className="mstats-ratings">
        <RatingCol
          title={result.homeClubName}
          stats={result.playerStats.home}
          highlight={mine(result.homeClubId)}
        />
        <RatingCol
          title={result.awayClubName}
          stats={result.playerStats.away}
          highlight={mine(result.awayClubId)}
        />
      </div>
    </div>
  );
}

function StatBar({ label, home, away, homePct }: { label: string; home: string; away: string; homePct: number }) {
  return (
    <div className="mstat-row">
      <span className="mstat-home">{home}</span>
      <div className="mstat-mid">
        <div className="mstat-label">{label}</div>
        <div className="mstat-bar">
          <div className="mstat-fill" style={{ width: `${Math.max(0, Math.min(100, homePct))}%` }} />
        </div>
      </div>
      <span className="mstat-away">{away}</span>
    </div>
  );
}

function RatingCol({ title, stats, highlight }: { title: string; stats: PlayerMatchStat[]; highlight: boolean }) {
  const rows = [...stats].sort((a, b) => b.rating - a.rating).slice(0, 11);
  return (
    <div className={highlight ? 'rating-col mine' : 'rating-col'}>
      <h4>{title}</h4>
      <table className="data-table compact">
        <tbody>
          {rows.map((s) => (
            <tr key={s.playerId}>
              <td className="name">{s.name}{s.goals > 0 ? ` ${'⚽'.repeat(s.goals)}` : ''}</td>
              <td className={ratingCls(s.rating)}>{s.rating.toFixed(1)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td className="muted small" colSpan={2}>기록 없음</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ratingCls(r: number): string {
  return `${ratingClass(r)} rating`.trim();
}

/** 경기 상세 모달 (헤더 + 통계). */
export function MatchDetailModal({
  result, myClubId, onClose,
}: { result: MatchResult; myClubId?: string; onClose: () => void }) {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal match-detail"
        role="dialog"
        aria-modal="true"
        aria-label={`${result.homeClubName} ${result.score[0]} : ${result.score[1]} ${result.awayClubName} 경기 상세`}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>
            {result.homeClubName} <b>{result.score[0]} : {result.score[1]}</b> {result.awayClubName}
          </h2>
          <button className="btn-ghost" onClick={onClose}>닫기 ✕</button>
        </div>
        <MatchHighlights result={result} />
        <MatchStats result={result} myClubId={myClubId} />
      </div>
    </div>
  );
}
