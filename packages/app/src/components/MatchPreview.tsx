import type { MatchPreview as Preview, TeamPreview } from '../game.js';
import type { TeamStrength, FormResult } from '@soccer-tycoon/engine';

const METRICS: { key: keyof TeamStrength; label: string }[] = [
  { key: 'attack', label: '공격' },
  { key: 'creation', label: '창출' },
  { key: 'midfield', label: '중원' },
  { key: 'defense', label: '수비' },
  { key: 'physical', label: '신체' },
  { key: 'aerial', label: '공중' },
  { key: 'gk', label: 'GK' },
];

const FORM_MARK: Record<FormResult, string> = { W: '승', D: '무', L: '패' };

export function MatchPreview({ preview, rivalClubId }: { preview: Preview; rivalClubId?: string }) {
  const { home, away } = preview;
  const isDerby = rivalClubId !== undefined && (home.clubId === rivalClubId || away.clubId === rivalClubId);
  return (
    <div className="preview">
      <h3>경기 프리뷰</h3>
      {isDerby && <div className="derby-banner">🔥 라이벌전</div>}
      <div className="pv-teams">
        <TeamHead team={home} align="left" />
        <span className="pv-vs">VS</span>
        <TeamHead team={away} align="right" />
      </div>

      <div className="pv-metrics">
        {METRICS.map((m) => {
          const h = home.strength[m.key];
          const a = away.strength[m.key];
          const tot = h + a || 1;
          const hp = Math.round((h / tot) * 100);
          return (
            <div className="pv-row" key={m.key}>
              <span className={`pv-num ${h >= a ? 'lead' : ''}`}>{Math.round(h)}</span>
              <div className="pv-bar">
                <div className={`pv-seg ${home.isMine ? 'mine' : 'opp'}`} style={{ width: `${hp}%` }} />
                <div className={`pv-seg ${away.isMine ? 'mine' : 'opp'}`} style={{ width: `${100 - hp}%` }} />
                <span className="pv-label">{m.label}</span>
              </div>
              <span className={`pv-num ${a >= h ? 'lead' : ''}`}>{Math.round(a)}</span>
            </div>
          );
        })}
      </div>
      <p className="pv-hint muted small">막대는 두 팀의 상대적 전력 비중입니다. 하프타임에 전술을 바꿀 수 있습니다.</p>
    </div>
  );
}

function TeamHead({ team, align }: { team: TeamPreview; align: 'left' | 'right' }) {
  return (
    <div className={`pv-team ${align}`}>
      <div className="pv-name">
        {team.isMine && <span className="pv-tag">내 구단</span>}
        <b>{team.name}</b>
      </div>
      <div className="pv-pos muted small">{team.position ? `리그 ${team.position}위` : '순위 —'}</div>
      <div className="pv-form">
        {team.form.results.length === 0 ? (
          <span className="muted small">최근 경기 없음</span>
        ) : (
          team.form.results.map((r, i) => (
            <span key={i} className={`form-dot ${r}`} title={FORM_MARK[r]}>{FORM_MARK[r]}</span>
          ))
        )}
      </div>
      {team.keyPlayer && (
        <div className="pv-key muted small">핵심 {team.keyPlayer.name} · CA {team.keyPlayer.ca}</div>
      )}
    </div>
  );
}
