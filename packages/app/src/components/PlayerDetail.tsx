import {
  TECHNICAL_ATTRS, MENTAL_ATTRS, PHYSICAL_ATTRS, GOALKEEPING_ATTRS,
  TRAINING_FOCUSES, TRAINING_LABELS, TRAIT_LABELS, TRAIT_DESC,
  currentAbility, marketValue, playerDerived, isInjured, isSuspended,
  formatMoney, buildScoutingReport,
  type AttrKey, type Player, type DerivedRatings, type TrainingFocus,
  type PlayerFormEntry, type OverallTier, type PotentialTier, type AgeProfile, type ScoutingReport,
} from '@soccer-tycoon/engine';
import { formStability, revealPotential, type TimelineEntry, type SeasonRatingEntry } from '../game.js';
import { useModalA11y } from './useModalA11y.js';
import { useResultToast } from '../toast.js';

function moraleLabel(m: number): { text: string; cls: string } {
  if (m >= 0.65) return { text: '😀 만족', cls: 'cond-good' };
  if (m >= 0.4) return { text: '😐 보통', cls: '' };
  return { text: '😠 불만', cls: 'injury' };
}

function ratingCls(r: number): string {
  return r >= 7.5 ? 'good' : r >= 6.5 ? 'mid' : 'poor';
}

export const OVERALL_LABEL: Record<OverallTier, string> = {
  worldClass: '월드클래스', star: '스타급', quality: '준수한 실력자',
  squad: '스쿼드 로테이션 자원', fringe: '주전 경쟁이 필요한 자원',
};
export const POTENTIAL_LABEL: Record<PotentialTier, string> = {
  generational: '역대급 잠재력', high: '높은 성장 가능성', moderate: '보통 수준의 성장 가능성',
  limited: '제한적인 성장 여지', unknown: '성장 가능성 미상',
};
export const AGE_LABEL: Record<AgeProfile, string> = {
  wonderkid: '유망주', prime: '전성기', veteran: '베테랑', declining: '노장',
};

/** 내 구단 소속 선수는 스카우팅 안개가 없으므로, 호출부(App.tsx)가 이 값을 scouting으로 넘긴다. */
export const FULL_SCOUTING = 20;

/** 스카우팅 리포트 서술 블록(선수 상세·이적 시장 협상 모달에서 공유). */
export function ScoutingSummary({ report, title }: { report: ScoutingReport; title?: string }) {
  return (
    <div className="pd-scouting">
      <h3>{title ?? '🔎 스카우팅 리포트'}</h3>
      <p>
        {AGE_LABEL[report.ageProfile]} · <b>{OVERALL_LABEL[report.overallTier]}</b> ·{' '}
        {POTENTIAL_LABEL[report.potentialTier]}
      </p>
      <p className="muted small">
        강점: {report.strengths.map((k) => ATTR_LABELS[k]).join(', ')}
        {' · '}약점: {report.weaknesses.map((k) => ATTR_LABELS[k]).join(', ')}
      </p>
    </div>
  );
}

function ScoutingPanel({ player, scouting }: { player: Player; scouting: number }) {
  const report = buildScoutingReport(player, scouting);
  return <ScoutingSummary report={report} />;
}

export const ATTR_LABELS: Record<AttrKey, string> = {
  finishing: '결정력', shooting: '슈팅력', passing: '패스', crossing: '크로스',
  dribbling: '드리블', firstTouch: '퍼스트터치', technique: '기술', tackling: '태클',
  marking: '마크', heading: '헤딩', setPiece: '세트피스',
  vision: '시야', composure: '침착성', decisions: '판단력', anticipation: '예측',
  offTheBall: '오프더볼', positioning: '위치선정', concentration: '집중력', teamwork: '팀워크',
  workRate: '활동량', aggression: '적극성', bravery: '대담성', leadership: '리더십',
  pace: '속도', acceleration: '가속력', stamina: '스태미너', strength: '몸싸움',
  agility: '민첩성', balance: '밸런스', jumping: '점프', naturalFitness: '자연회복',
  reflexes: '반응속도', handling: '핸들링', oneOnOne: '일대일', aerialReach: '공중장악',
  goalkicks: '골킥/배급',
};

const DERIVED_LABELS: { key: keyof DerivedRatings; label: string }[] = [
  { key: 'attack', label: '공격' }, { key: 'creation', label: '창출' },
  { key: 'midfield', label: '중원' }, { key: 'defense', label: '수비' },
  { key: 'physical', label: '신체' }, { key: 'aerial', label: '공중' },
  { key: 'gk', label: '골키핑' },
];

function attrClass(v: number): string {
  return v >= 15 ? 'attr-hi' : v >= 10 ? 'attr-mid' : 'attr-lo';
}

function statusBadge(p: Player): { text: string; cls: string } {
  if (isInjured(p)) return { text: `🤕 ${p.injuryName ?? '부상'} ${p.injuryMatches}경기`, cls: 'injury' };
  if (isSuspended(p)) return { text: `🟥 출전정지 ${p.suspensionMatches}경기`, cls: 'suspended' };
  return { text: `컨디션 ${Math.round(p.condition * 100)}%`, cls: 'cond-good' };
}

interface Props {
  player: Player;
  onClose: () => void;
  /** 내 선수면 훈련 포커스 설정 가능. */
  onSetFocus?: (focus: TrainingFocus) => void;
  /** 내 선수면 재계약 가능. */
  onRenew?: () => { ok: boolean; message: string };
  /** 진행 중 시즌 최근 폼(평점). live 없거나 미출전이면 빈 배열. */
  recentForm?: PlayerFormEntry[];
  /** 커리어 타임라인(이적·마일스톤·은퇴). 시즌순. */
  timeline?: TimelineEntry[];
  /** 내 구단 소속으로 출전한 시즌의 평균 평점 이력. 시즌순. */
  ratingHistory?: SeasonRatingEntry[];
  /** 이 선수에 대한 스카우팅 레벨(PA 공개 정도·강점/약점 리포트에 반영).
   *  내 구단 선수면 FULL_SCOUTING, 아니면 club.staff.scouting을 넘긴다. */
  scouting: number;
}

export function PlayerDetail({
  player, onClose, onSetFocus, onRenew, recentForm, timeline, ratingHistory, scouting,
}: Props) {
  const toast = useResultToast();
  const ca = currentAbility(player);
  const derived = playerDerived(player, player.position);
  const status = statusBadge(player);
  const fam = Object.entries(player.familiarity)
    .filter(([, v]) => (v ?? 0) >= 0.5)
    .map(([pos]) => pos);
  const stability = formStability(ratingHistory ?? []);
  const ref = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal player-detail"
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name} 선수 상세`}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{player.name}</h2>
            <div className="muted pd-sub">
              {player.position} · {player.age}세 · {player.nationality} · 계약 {player.contractYears}년
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose}>닫기 ✕</button>
        </div>

        <div className="pd-meta">
          <span>CA <b>{ca.toFixed(0)}</b></span>
          <span>PA <b>{revealPotential(scouting, player.potential)}</b></span>
          <span>가치 <b>{formatMoney(marketValue(player))}</b></span>
          <span>주급 <b>{formatMoney(player.wage)}</b></span>
          <span className={status.cls}>{status.text}</span>
          <span className={moraleLabel(player.morale).cls}>사기 {moraleLabel(player.morale).text}</span>
          <span className="muted">시즌 {player.seasonApps}경 {player.seasonGoals ?? 0}골</span>
          {((player.careerApps ?? 0) > 0 || (player.careerGoals ?? 0) > 0) && (
            <span className="muted" title="이전 시즌까지 통산 기록">통산 {player.careerApps ?? 0}경 {player.careerGoals ?? 0}골</span>
          )}
          {(player.caps ?? 0) > 0 && <span className="pd-caps" title="국가대표 A매치 출전 캡">🎽 A매치 {player.caps}경</span>}
        </div>

        {recentForm && recentForm.length > 0 && (
          <div className="pd-form">
            <span className="muted small">최근 폼</span>
            {recentForm.map((f, i) => (
              <span key={i} className={`form-rating ${ratingCls(f.rating)}`} title={`vs ${f.opponentName} (${f.home ? '홈' : '원정'})`}>
                {f.rating.toFixed(1)}{f.goals > 0 ? ` ⚽${f.goals}` : ''}
              </span>
            ))}
          </div>
        )}

        {onRenew && (
          <div className="pd-renew">
            {player.contractYears <= 2 ? (
              <>
                <span className="muted">계약 만료 임박 ({player.contractYears}년) — </span>
                <button className="btn-small" onClick={() => toast(onRenew())}>재계약 (계약금 {formatMoney(player.wage * 20)})</button>
              </>
            ) : (
              <span className="muted small">계약 {player.contractYears}년 남음 — 재계약 불필요.</span>
            )}
          </div>
        )}
        {(player.traits ?? []).length > 0 && (
          <div className="pd-traits">
            {(player.traits ?? []).map((t) => (
              <span key={t} className="trait-chip" title={TRAIT_DESC[t]}>★ {TRAIT_LABELS[t]}</span>
            ))}
          </div>
        )}
        <ScoutingPanel player={player} scouting={scouting} />
        <div className="pd-fam muted">가능 포지션: {fam.join(', ') || player.position}</div>

        {onSetFocus && (
          <div className="pd-training">
            <span className="muted">훈련 포커스:</span>
            <select value={player.trainingFocus} onChange={(e) => onSetFocus(e.target.value as TrainingFocus)}>
              {TRAINING_FOCUSES.map((f) => (
                <option key={f} value={f}>{TRAINING_LABELS[f]}</option>
              ))}
            </select>
            <span className="muted small">시즌 성장 시 해당 능력 그룹을 강조합니다 (성장 중인 선수).</span>
          </div>
        )}

        <GrowthChart history={player.caHistory ?? []} current={Math.round(ca)} />

        {ratingHistory && ratingHistory.length >= 2 && <RatingChart history={ratingHistory} />}
        {stability && (
          <p className="muted small pd-form-stability">
            {stability === 'steady'
              ? '📊 폼 안정성: 시즌마다 꾸준한 경기력을 보였습니다.'
              : '📊 폼 안정성: 시즌별 기복이 있는 편입니다.'}
          </p>
        )}

        {timeline && timeline.length > 0 && <CareerTimeline entries={timeline} />}

        <div className="pd-cols">
          <AttrGroup title="기술" attrs={TECHNICAL_ATTRS} player={player} />
          <AttrGroup title="정신" attrs={MENTAL_ATTRS} player={player} />
          <div>
            <AttrGroup title="신체" attrs={PHYSICAL_ATTRS} player={player} />
            {player.position === 'GK' && (
              <AttrGroup title="골키핑" attrs={GOALKEEPING_ATTRS} player={player} />
            )}
          </div>
        </div>

        <div className="pd-derived">
          <h3>파생 전력</h3>
          {DERIVED_LABELS.map(({ key, label }) => (
            <div className="bar-row" key={key}>
              <span className="bar-label">{label}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100, derived[key])}%` }} />
              </div>
              <span className="bar-val">{derived[key].toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 시즌별 CA 스냅샷 + 현재 CA로 성장 곡선 스파크라인을 그린다. */
function GrowthChart({ history, current }: { history: number[]; current: number }) {
  const pts = [...history, current];
  if (pts.length < 2) {
    return (
      <div className="pd-growth">
        <h3>성장 추이 <span className="muted small">(시즌별 CA)</span></h3>
        <p className="muted small">시즌을 마치면 성장 곡선이 쌓입니다.</p>
      </div>
    );
  }
  const W = 320, H = 64, pad = 6;
  const lo = Math.min(...pts) - 2;
  const hi = Math.max(...pts) + 2;
  const span = Math.max(1, hi - lo);
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - pad * 2);
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const rising = current >= pts[0]!;
  const color = rising ? '#3ddc84' : '#e0a83b';

  return (
    <div className="pd-growth">
      <h3>성장 추이 <span className="muted small">(시즌별 CA · 현재 {current})</span></h3>
      <svg width={W} height={H} className="growth-svg" role="img" aria-label="CA 성장 곡선">
        <polyline points={line} fill="none" stroke={color} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === pts.length - 1 ? 3.5 : 2}
            fill={i === pts.length - 1 ? color : 'rgba(255,255,255,0.5)'} />
        ))}
      </svg>
      <div className="growth-ends muted small">
        <span>{pts[0]}</span>
        <span>최고 {Math.max(...pts)}</span>
        <span>{current}</span>
      </div>
    </div>
  );
}

/** 시즌별 평균 평점 추이(내 구단 소속 출전 시즌만) — 성장 곡선과 같은 스파크라인 형식. */
function RatingChart({ history }: { history: SeasonRatingEntry[] }) {
  const pts = history.map((h) => h.avgRating);
  const W = 320, H = 64, pad = 6;
  const lo = Math.min(...pts) - 0.3;
  const hi = Math.max(...pts) + 0.3;
  const span = Math.max(0.1, hi - lo);
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - pad * 2);
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const rising = pts[pts.length - 1]! >= pts[0]!;
  const color = rising ? '#3ddc84' : '#e0a83b';

  return (
    <div className="pd-growth">
      <h3>시즌 평점 추이 <span className="muted small">(내 구단 소속 · 최근 {pts[pts.length - 1]!.toFixed(1)})</span></h3>
      <svg width={W} height={H} className="growth-svg" role="img" aria-label="시즌 평점 추이">
        <polyline points={line} fill="none" stroke={color} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === pts.length - 1 ? 3.5 : 2}
            fill={i === pts.length - 1 ? color : 'rgba(255,255,255,0.5)'} />
        ))}
      </svg>
      <div className="growth-ends muted small">
        <span>시즌 {history[0]!.season}</span>
        <span>최고 {Math.max(...pts).toFixed(1)}</span>
        <span>시즌 {history[history.length - 1]!.season}</span>
      </div>
    </div>
  );
}

const MILESTONE_KIND_LABEL: Record<'apps' | 'goals', string> = { apps: '경기 출전', goals: '골' };

/** 이적·통산 마일스톤·은퇴를 시즌 역순(최신 먼저)으로 나열. */
function CareerTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="pd-timeline">
      <h3>🗓️ 커리어 타임라인</h3>
      <ul className="timeline-list">
        {[...entries].reverse().map((e, i) => (
          <li key={i} className={`timeline-item ${e.kind}`}>
            <span className="timeline-season">시즌 {e.season}</span>
            {e.kind === 'transfer' && (
              <span className="timeline-text">
                🔄 {e.fromClubName} → <b>{e.toClubName}</b> 이적
                {e.fee > 0 && <span className="muted small"> ({formatMoney(e.fee)})</span>}
              </span>
            )}
            {e.kind === 'milestone' && (
              <span className="timeline-text">
                🎉 통산 <b>{e.value}{MILESTONE_KIND_LABEL[e.milestoneKind]}</b> 달성
              </span>
            )}
            {e.kind === 'retired' && (
              <span className="timeline-text">
                🕯️ {e.finalAge}세로 은퇴 — 통산 {e.careerApps}경기 {e.careerGoals}골
                {e.caps > 0 && <span className="muted small"> · A매치 {e.caps}경</span>}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttrGroup({
  title, attrs, player,
}: { title: string; attrs: readonly AttrKey[]; player: Player }) {
  return (
    <div className="attr-group">
      <h3>{title}</h3>
      <table className="attr-table">
        <tbody>
          {attrs.map((k) => (
            <tr key={k}>
              <td className="attr-name">{ATTR_LABELS[k]}</td>
              <td className={`attr-val ${attrClass(player.attributes[k])}`}>{player.attributes[k]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
