import type { MatchResult, PlayerMatchStat } from '@soccer-tycoon/engine';
import { useModalA11y } from './useModalA11y.js';
import { ratingClass } from '../rating.js';

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
          {rows.length === 0 && <tr><td className="muted small">기록 없음</td></tr>}
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
        <MatchStats result={result} myClubId={myClubId} />
      </div>
    </div>
  );
}
