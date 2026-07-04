import type { MatchPreview as Preview, TeamPreview } from '../game.js';
import type { TeamStrength, FormResult } from '@soccer-tycoon/engine';
import { ATTR_LABELS } from './PlayerDetail.js';

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

/** 두 팀의 전력 지표를 비교해 스카우팅 리포트 한 줄 요약을 만든다(가장 큰 격차 위주). */
function scoutingInsight(mine: TeamStrength, opp: TeamStrength): string {
  const THRESHOLD = 6;
  let oppBest: { label: string; gap: number; m: number; o: number } | null = null;
  let mineBest: { label: string; gap: number; m: number; o: number } | null = null;
  for (const { key, label } of METRICS) {
    const gap = opp[key] - mine[key];
    if (gap > 0 && (!oppBest || gap > oppBest.gap)) oppBest = { label, gap, m: mine[key], o: opp[key] };
    if (gap < 0 && (!mineBest || -gap > mineBest.gap)) mineBest = { label, gap: -gap, m: mine[key], o: opp[key] };
  }
  const parts: string[] = [];
  if (oppBest && oppBest.gap >= THRESHOLD) {
    parts.push(`상대는 ${oppBest.label}에서 앞섭니다 (${Math.round(oppBest.o)} vs ${Math.round(oppBest.m)})`);
  }
  if (mineBest && mineBest.gap >= THRESHOLD) {
    parts.push(`우리는 ${mineBest.label}에서 더 강합니다 (${Math.round(mineBest.m)} vs ${Math.round(mineBest.o)})`);
  }
  return parts.length === 0 ? '두 팀의 전력이 전반적으로 비슷합니다.' : `${parts.join(' · ')}.`;
}

export function MatchPreview({ preview, rivalClubId }: { preview: Preview; rivalClubId?: string }) {
  const { home, away } = preview;
  const isDerby = rivalClubId !== undefined && (home.clubId === rivalClubId || away.clubId === rivalClubId);
  const mine = home.isMine ? home : away;
  const opp = home.isMine ? away : home;
  return (
    <div className="preview">
      <h3>경기 프리뷰</h3>
      {isDerby && <div className="derby-banner">🔥 라이벌전</div>}
      <div className="pv-teams">
        <TeamHead team={home} align="left" />
        <span className="pv-vs">VS</span>
        <TeamHead team={away} align="right" />
      </div>

      <div className="pv-insight">🔎 {scoutingInsight(mine.strength, opp.strength)}</div>

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
        <div className="pv-key muted small">
          핵심 {team.keyPlayer.name} · CA {team.keyPlayer.ca}
          {team.keyPlayerReport && (
            <div className="pv-key-attrs">
              강점 {team.keyPlayerReport.strengths.map((k) => ATTR_LABELS[k]).join('/')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
