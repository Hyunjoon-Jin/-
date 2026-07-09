import {
  TECHNICAL_ATTRS, MENTAL_ATTRS, PHYSICAL_ATTRS, GOALKEEPING_ATTRS, POSITIONS,
  TRAINING_FOCUSES, TRAINING_LABELS, TRAIT_LABELS, TRAIT_DESC,
  currentAbility, marketValue, playerDerived, isInjured, isSuspended, lineOf, familiarityAt,
  formatMoney, buildScoutingReport, retireChance, RETIRE_MIN_AGE, scoutDispatchCost,
  loyaltyTier, loyaltyDiscount, LOYALTY_TRUSTED_SEASONS, LOYALTY_LEGEND_SEASONS,
  POSITION_MASTERY_MILESTONES,
  type AttrKey, type Player, type DerivedRatings, type TrainingFocus, type Position,
  type PlayerFormEntry, type OverallTier, type PotentialTier, type AgeProfile, type ScoutingReport,
} from '@soccer-tycoon/engine';
import { useState } from 'react';
import {
  formStability, revealPotential, RENEWAL_MIN_YEARS, RENEWAL_MAX_YEARS,
  type TimelineEntry, type SeasonRatingEntry,
} from '../game.js';
import { useModalA11y } from './useModalA11y.js';
import { useResultToast } from '../toast.js';
import { onKeyActivate } from '../a11y.js';
import { InfoTip } from './InfoTip.js';
import { flagFor } from '../flags.js';
import { LINE_X, SIDE_Y } from './MatchPitch.js';

function moraleLabel(m: number): { text: string; cls: string } {
  if (m >= 0.65) return { text: '😀 만족', cls: 'cond-good' };
  if (m >= 0.4) return { text: '😐 보통', cls: '' };
  return { text: '😠 불만', cls: 'injury' };
}

/** 로열티(신규 개선 항목 10) 등급 배지 — newcomer는 특별히 표시하지 않는다. */
function loyaltyBadge(seasonsAtClub: number): { text: string; title: string } | null {
  const tier = loyaltyTier(seasonsAtClub);
  if (tier === 'legend') {
    return { text: `🏅 원클럽맨(${seasonsAtClub}시즌)`, title: `${LOYALTY_LEGEND_SEASONS}시즌 이상 한 구단에 머물러 재계약 계약금이 최대로 할인됩니다.` };
  }
  if (tier === 'trusted') {
    return { text: `🤝 신뢰받는 선수(${seasonsAtClub}시즌)`, title: `${LOYALTY_TRUSTED_SEASONS}시즌 이상 한 구단에 머물러 재계약 계약금이 할인됩니다.` };
  }
  return null;
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

/** 복귀 직후 재부상 위험/능력치 회복 지연 배지 — 둘 다 없으면 undefined. */
function recoveryBadges(p: Player): { text: string; cls: string }[] {
  const badges: { text: string; cls: string }[] = [];
  if ((p.reinjuryRiskMatches ?? 0) > 0) {
    badges.push({ text: `⚠️ 재부상 위험 ${p.reinjuryRiskMatches}경기`, cls: 'injury-risk' });
  }
  if ((p.recoveryAttrMatches ?? 0) > 0 && p.injuryBodyPart && p.injuryBodyPart !== 'general') {
    badges.push({ text: `🩹 능력치 회복 지연 ${p.recoveryAttrMatches}경기`, cls: 'recovering' });
  }
  return badges;
}

interface Props {
  player: Player;
  onClose: () => void;
  /** 내 선수면 훈련 포커스 설정 가능. */
  onSetFocus?: (focus: TrainingFocus) => void;
  /** 내 선수면 포지션 전환 훈련 대상 설정 가능(해제는 undefined). */
  onSetTrainingPosition?: (position: Position | undefined) => void;
  /** 내 선수면 재계약 가능. years(계약 기간)·signOnBonus(사인온보너스, 신규 개선 항목 5)를 선택해 넘긴다. */
  onRenew?: (years: number, signOnBonus: number) => { ok: boolean; message: string };
  /** 진행 중 시즌 최근 폼(평점). live 없거나 미출전이면 빈 배열. */
  recentForm?: PlayerFormEntry[];
  /** 커리어 타임라인(이적·마일스톤·은퇴). 시즌순. */
  timeline?: TimelineEntry[];
  /** 내 구단 소속으로 출전한 시즌의 평균 평점 이력. 시즌순. */
  ratingHistory?: SeasonRatingEntry[];
  /** 이 선수에 대한 스카우팅 레벨(PA 공개 정도·강점/약점 리포트에 반영).
   *  내 구단 선수면 FULL_SCOUTING, 아니면 club.staff.scouting을 넘긴다. */
  scouting: number;
  /** 이 선수를 이미 파견 정찰했는지(B13) — true면 scouting과 무관하게 PA가 정확히 보인다. */
  scouted?: boolean;
  /** 내 선수가 아니고 아직 파견 정찰하지 않았으면 파견 버튼을 보여준다. */
  onDispatchScout?: () => { ok: boolean; message: string };
  /** 임대 중인 선수면 원 소속 구단명(loanFromClubId를 이름으로 미리 변환해 전달). */
  loanFromClubName?: string;
}

type PdTab = 'overview' | 'development' | 'career';
const PD_TABS: { key: PdTab; label: string }[] = [
  { key: 'overview', label: '개요' },
  { key: 'development', label: '성장' },
  { key: 'career', label: '커리어' },
];

/** 재계약 시 계약 기간·사인온보너스(신규 개선 항목 5)를 골라 확정하는 인라인 패널. */
function RenewPanel({
  player, onRenew, toast,
}: {
  player: Player;
  onRenew: (years: number, signOnBonus: number) => { ok: boolean; message: string };
  toast: (r: { ok: boolean; message: string }) => void;
}) {
  const [years, setYears] = useState(4);
  const [signOnBonus, setSignOnBonus] = useState(0);
  const discount = loyaltyDiscount(player.seasonsAtClub ?? 0);
  const baseCost = Math.round(player.wage * 20 * (years / 4) * (1 - discount));

  return (
    <div className="pd-renew-panel">
      <span className="muted">계약 만료 임박 ({player.contractYears}년)</span>
      <label className="loan-field">
        <span>계약 기간</span>
        <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
          {Array.from({ length: RENEWAL_MAX_YEARS - RENEWAL_MIN_YEARS + 1 }, (_, i) => RENEWAL_MIN_YEARS + i).map((n) => (
            <option key={n} value={n}>{n}년</option>
          ))}
        </select>
      </label>
      <label className="loan-field">
        <span>사인온보너스(선택)</span>
        <input
          type="number" min={0} step={1000} value={signOnBonus}
          onChange={(e) => setSignOnBonus(Math.max(0, Number(e.target.value)))}
        />
      </label>
      <button className="btn-small" onClick={() => toast(onRenew(years, signOnBonus))}>
        재계약 (계약금 {formatMoney(baseCost + signOnBonus)}{discount > 0 ? ` · 로열티 -${Math.round(discount * 100)}%` : ''})
      </button>
    </div>
  );
}

export function PlayerDetail({
  player, onClose, onSetFocus, onSetTrainingPosition, onRenew, recentForm, timeline, ratingHistory, scouting,
  scouted, onDispatchScout, loanFromClubName,
}: Props) {
  const toast = useResultToast();
  const ca = currentAbility(player);
  const derived = playerDerived(player, player.position);
  const status = statusBadge(player);
  const stability = formStability(ratingHistory ?? []);
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const [tab, setTab] = useState<PdTab>('overview');

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
            <h2>{player.squadNumber !== undefined && <span className="pd-number">#{player.squadNumber}</span>} {player.name}</h2>
            <div className="muted pd-sub">
              <span className={`pos-chip pos-${lineOf(player.position).toLowerCase()}`}>{player.position}</span>
              {' · '}{player.age}세 · {flagFor(player.nationality)} {player.nationality} · 계약 {player.contractYears}년
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose}>닫기 ✕</button>
        </div>

        <div className="pd-meta">
          <span>CA <b>{ca.toFixed(0)}</b></span>
          <span>
            PA <b>{revealPotential(scouting, player.potential, scouted)}</b>
            <InfoTip title="CA / PA">
              CA는 현재 실력, PA는 성장했을 때 도달 가능한 최대 실력입니다. 스카우팅 레벨이
              낮으면 PA가 범위("~")로만 표시되며, 스태프의 스카우팅 등급을 올리면 더 정확히
              드러납니다. 내 구단 선수는 항상 정확한 PA가 보입니다. 특정 선수를 파견
              정찰하면(B13) 구단 전체 스카우팅 레벨과 무관하게 그 선수만 항상 정확히 보입니다.
            </InfoTip>
            {onDispatchScout && !scouted && (
              <button
                className="btn-ghost pd-dispatch-btn"
                onClick={() => toast(onDispatchScout())}
                title="이 선수를 파견 정찰해 PA를 정확히 알아냅니다"
              >
                🔭 파견 정찰 ({formatMoney(scoutDispatchCost(scouting))})
              </button>
            )}
          </span>
          <span>가치 <b>{formatMoney(marketValue(player))}</b></span>
          <span>주급 <b>{formatMoney(player.wage)}</b></span>
          {player.releaseClause !== undefined && (
            <span className="pd-clause" title="협상 없이 이 금액으로 즉시 영입 가능">
              🔓 방출조항 <b>{formatMoney(player.releaseClause)}</b>
            </span>
          )}
          {player.loanFromClubId !== undefined && (
            <span className="loan-badge" title="다른 구단에서 임대로 데려온 선수 — 임대 기간이 끝나면 원 소속으로 복귀">
              🔁 임대{loanFromClubName ? ` (원 소속: ${loanFromClubName})` : ''} · 복귀까지 {player.loanSeasonsRemaining ?? 1}시즌
            </span>
          )}
          <span className={status.cls}>{status.text}</span>
          {recoveryBadges(player).map((b) => (
            <span key={b.cls} className={b.cls} title="복귀 직후 일정 기간 지속되는 효과입니다">{b.text}</span>
          ))}
          <span className={moraleLabel(player.morale).cls}>사기 {moraleLabel(player.morale).text}</span>
          <span className="muted">시즌 {player.seasonApps}경 {player.seasonGoals ?? 0}골</span>
          {((player.careerApps ?? 0) > 0 || (player.careerGoals ?? 0) > 0) && (
            <span className="muted" title="이전 시즌까지 통산 기록">통산 {player.careerApps ?? 0}경 {player.careerGoals ?? 0}골</span>
          )}
          {(player.caps ?? 0) > 0 && <span className="pd-caps" title="국가대표 A매치 출전 캡">🎽 A매치 {player.caps}경</span>}
          {loyaltyBadge(player.seasonsAtClub ?? 0) && (
            <span className="pd-caps" title={loyaltyBadge(player.seasonsAtClub ?? 0)!.title}>
              {loyaltyBadge(player.seasonsAtClub ?? 0)!.text}
            </span>
          )}
        </div>

        <div className="modal-tabs" role="tablist">
          {PD_TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'modal-tab active' : 'modal-tab'}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              onKeyDown={onKeyActivate(() => setTab(t.key))}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
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
                  <RenewPanel player={player} onRenew={onRenew} toast={toast} />
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
            <PositionFamiliarity player={player} />

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
          </>
        )}

        {tab === 'development' && (
          <>
            {onSetFocus && (
              <div className="pd-training">
                <span className="muted">
                  훈련 포커스:
                  <InfoTip title="훈련 포커스">
                    시즌 성장 시 선택한 능력 그룹(기술/정신/신체 등)이 더 크게 오릅니다. 이미
                    성장이 끝난 노장 선수에게는 큰 영향이 없습니다.
                  </InfoTip>
                </span>
                <select value={player.trainingFocus} onChange={(e) => onSetFocus(e.target.value as TrainingFocus)}>
                  {TRAINING_FOCUSES.map((f) => (
                    <option key={f} value={f}>{TRAINING_LABELS[f]}</option>
                  ))}
                </select>
                <span className="muted small">시즌 성장 시 해당 능력 그룹을 강조합니다 (성장 중인 선수).</span>
              </div>
            )}

            {onSetTrainingPosition && (
              <div className="pd-training">
                <span className="muted">
                  포지션 전환 훈련:
                  <InfoTip title="포지션 전환 훈련">
                    지정한 포지션의 숙련도가 시즌 경계마다 코칭 레벨과 판단력에 비례해 오릅니다.
                    실전 출전만으로 오르는 것보다 훨씬 빠릅니다.
                  </InfoTip>
                </span>
                <select
                  value={player.trainingPosition ?? ''}
                  onChange={(e) => onSetTrainingPosition(e.target.value ? (e.target.value as Position) : undefined)}
                >
                  <option value="">지정 안 함</option>
                  {POSITIONS.filter((p) => p !== player.position).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <span className="muted small">시즌이 끝날 때마다 코칭 지원을 받아 숙련도가 상승합니다.</span>
                {player.trainingPosition && (() => {
                  const famPct = Math.round(familiarityAt(player, player.trainingPosition) * 100);
                  const next = POSITION_MASTERY_MILESTONES.find((m) => m > famPct);
                  return next !== undefined && (
                    <span className="muted small pd-milestone-target">
                      🎯 다음 목표: 숙련도 <b>{next}%</b> (현재 {famPct}%)
                    </span>
                  );
                })()}
              </div>
            )}

            <GrowthChart history={player.caHistory ?? []} current={Math.round(ca)} />

            {player.age >= RETIRE_MIN_AGE && (
              <p className="muted small pd-retirement">
                🕯️ 은퇴 전망: 시즌 후 은퇴 확률 약{' '}
                <b>{Math.round(retireChance(player.age, player.attributes.naturalFitness) * 100)}%</b>
                <InfoTip title="은퇴 확률">
                  나이와 자연회복 능력치로 정해집니다. 자연회복이 높을수록 만년까지 뛸 확률이
                  올라갑니다. 42세가 되면 확률과 무관하게 은퇴합니다.
                </InfoTip>
              </p>
            )}

            {ratingHistory && ratingHistory.length >= 2 && <RatingChart history={ratingHistory} />}
            {stability && (
              <p className="muted small pd-form-stability">
                {stability === 'steady'
                  ? '📊 폼 안정성: 시즌마다 꾸준한 경기력을 보였습니다.'
                  : '📊 폼 안정성: 시즌별 기복이 있는 편입니다.'}
              </p>
            )}
          </>
        )}

        {tab === 'career' && (
          timeline && timeline.length > 0
            ? <CareerTimeline entries={timeline} />
            : <p className="muted small">아직 커리어 기록이 없습니다.</p>
        )}
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
const AWARD_LABEL: Record<'playerOfSeason' | 'topScorer' | 'goldenGlove', { icon: string; text: string }> = {
  playerOfSeason: { icon: '⭐', text: '시즌 베스트 플레이어' },
  topScorer: { icon: '🥇', text: '득점왕' },
  goldenGlove: { icon: '🧤', text: '골든글러브' },
};

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
            {e.kind === 'positionMilestone' && (
              <span className="timeline-text">
                🎯 <b>{e.position}</b> 포지션 전환 훈련 숙련도 <b>{e.value}%</b> 달성
              </span>
            )}
            {e.kind === 'retired' && (
              <span className="timeline-text">
                🕯️ {e.finalAge}세로 은퇴 — 통산 {e.careerApps}경기 {e.careerGoals}골
                {e.caps > 0 && <span className="muted small"> · A매치 {e.caps}경</span>}
              </span>
            )}
            {e.kind === 'award' && (
              <span className="timeline-text">
                {AWARD_LABEL[e.awardKind].icon} <b>{AWARD_LABEL[e.awardKind].text}</b> 수상
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 주 포지션 + 실제로 숙련도가 쌓인(0.3 이상) 부 포지션을 숙련도 막대로 보여준다. */
const FAM_MAP_W = 340;
const FAM_MAP_H = 190;
const FAM_MAP_PAD = 18;

/** 포지션 숙련도 맵(신규 개선 항목 15) — MatchPitch와 같은 좌표계로 14개 포지션 전체를
 *  피치 모양 위에 점으로 배치해, 선수의 "포지션 커버리지"를 한눈에 보여준다.
 *  점의 불투명도가 숙련도를, 크기·테두리가 주 포지션/훈련 지정 포지션을 나타낸다. */
function FamiliarityMap({ player }: { player: Player }) {
  const innerW = FAM_MAP_W - FAM_MAP_PAD * 2;
  const innerH = FAM_MAP_H - FAM_MAP_PAD * 2;
  return (
    <svg className="fam-map-svg" viewBox={`0 0 ${FAM_MAP_W} ${FAM_MAP_H}`} role="img" aria-label="포지션 숙련도 맵">
      <rect
        x={FAM_MAP_PAD / 2} y={FAM_MAP_PAD / 2}
        width={FAM_MAP_W - FAM_MAP_PAD} height={FAM_MAP_H - FAM_MAP_PAD}
        rx={10} className="fam-map-pitch"
      />
      <line
        x1={FAM_MAP_W / 2} y1={FAM_MAP_PAD / 2} x2={FAM_MAP_W / 2} y2={FAM_MAP_H - FAM_MAP_PAD / 2}
        className="fam-map-midline"
      />
      {POSITIONS.map((pos) => {
        const fam = familiarityAt(player, pos);
        const x = FAM_MAP_PAD + LINE_X[pos] * innerW;
        const y = FAM_MAP_PAD + SIDE_Y[pos] * innerH;
        const isPrimary = pos === player.position;
        const isTraining = pos === player.trainingPosition;
        return (
          <g key={pos}>
            <circle
              cx={x} cy={y} r={isPrimary ? 13 : 9.5}
              className={`fam-dot${isPrimary ? ' primary' : ''}${isTraining ? ' training' : ''}`}
              style={{ opacity: 0.22 + fam * 0.78 }}
            >
              <title>{pos}{isPrimary ? ' (주 포지션)' : isTraining ? ' (전환 훈련 중)' : ''} — 숙련도 {Math.round(fam * 100)}%</title>
            </circle>
            <text x={x} y={y + (isPrimary ? 24 : 21)} textAnchor="middle" className="fam-label">{pos}</text>
          </g>
        );
      })}
    </svg>
  );
}

function PositionFamiliarity({ player }: { player: Player }) {
  const secondary = POSITIONS
    .filter((pos) => pos !== player.position)
    .map((pos) => ({ pos, v: familiarityAt(player, pos) }))
    .filter((e) => e.v >= 0.3)
    .sort((a, b) => b.v - a.v);

  return (
    <div className="pd-fam">
      <h3>
        포지션 숙련도
        <InfoTip title="포지션 숙련도">
          주 포지션 이외의 자리는 숙련도가 낮으면 파생 전력이 깎입니다. 실전에서 그 자리를
          꾸준히 뛰거나(느리게 상승), 개발 탭에서 포지션 전환 훈련을 지정하면(코칭 지원, 더
          빠르게 상승) 숙련도가 오릅니다. 아래 맵에서 점이 진할수록 숙련도가 높고, 금색 테두리는
          주 포지션·훈련 지정 포지션을 나타냅니다.
        </InfoTip>
      </h3>
      <FamiliarityMap player={player} />
      <div className="bar-row">
        <span className="bar-label">{player.position} (주)</span>
        <div className="bar-track"><div className="bar-fill" style={{ width: '100%' }} /></div>
        <span className="bar-val">100</span>
      </div>
      {secondary.length === 0 ? (
        <p className="muted small">아직 다른 포지션 경험이 없습니다.</p>
      ) : (
        secondary.map(({ pos, v }) => (
          <div className="bar-row" key={pos}>
            <span className="bar-label">
              {pos}{pos === player.trainingPosition ? ' 🎯' : ''}
            </span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${v * 100}%` }} /></div>
            <span className="bar-val">{Math.round(v * 100)}</span>
          </div>
        ))
      )}
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
