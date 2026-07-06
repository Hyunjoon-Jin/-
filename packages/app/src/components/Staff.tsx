import {
  ClipboardList, Stethoscope, Search, GraduationCap, Hand, Target, Shield, Dumbbell, Landmark, Users, School,
  Activity, Handshake,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { myClub, STAFF_LABEL, type GameState, type ActionOutcome } from '../game.js';
import {
  upgradeCost, STAFF_MAX, formatMoney, specialistCoachLevel, STAFF_TRAIT_LABEL, STAFF_TRAIT_DESC,
  STAFF_TRAIT_TIER_LABEL, STAFF_TRAIT_TIER_BONUS, staffMarketValue,
  STADIUM_MAX, stadiumUpgradeCost, stadiumMatchdayMultiplier,
  ACADEMY_MAX, academyUpgradeCost, academyPotentialBonus, staffTraitSynergyBonus,
  staffRaiseCost, STAFF_RAISE_ELIGIBLE_YEARS, ACADEMY_FOCUS_POTENTIAL_BONUS_PER_LEVEL,
  STAFF_RETIRE_MIN_AGE, buildInjuryRiskReport, buildInjuryRecoveryReport,
  TRAINING_GROUND_MAX, trainingGroundUpgradeCost, trainingGroundInjuryFactor,
  SPONSOR_CONTRACT_LABEL, SPONSOR_CONTRACT_LENGTH_SEASONS, SPONSOR_CONTRACT_SIGN_FEE_MULTIPLIER,
  SPONSOR_CONTRACT_STADIUM_MIN_LEVEL, sponsorContractPayout,
  type StaffKind, type SpecialistCoachKind, type NamedStaffKind, type Club, type Line, type InjuryRiskTier,
  type SponsorContractKind,
} from '@soccer-tycoon/engine';
import { useResultToast } from '../toast.js';
import { InfoTip } from './InfoTip.js';

interface Props {
  game: GameState;
  onUpgrade: (kind: StaffKind) => ActionOutcome;
  onUpgradeStadium: () => ActionOutcome;
  onUpgradeAcademy: () => ActionOutcome;
  onUpgradeTrainingGround: () => ActionOutcome;
  onNegotiateRaise: (kind: NamedStaffKind) => ActionOutcome;
  onSetAcademyFocus: (focus: Line | undefined) => void;
  onSignSponsorContract: (kind: SponsorContractKind) => ActionOutcome;
  onPoachStaff: (targetClubId: string, kind: NamedStaffKind, attempt: number) => ActionOutcome;
}

const SPONSOR_CONTRACT_KINDS: SponsorContractKind[] = ['kit', 'stadiumNaming'];

const ACADEMY_FOCUS_OPTIONS: { key: Line; label: string }[] = [
  { key: 'GK', label: 'GK' },
  { key: 'DEF', label: '수비' },
  { key: 'MID', label: '미드' },
  { key: 'ATT', label: '공격' },
];

const SPECIALIST_KINDS: SpecialistCoachKind[] = ['coachGk', 'coachAttack', 'coachDefense', 'coachPhysical'];
const NAMED_KINDS: NamedStaffKind[] = ['coaching', 'medical', 'scouting', 'youth'];

const STAFF: { key: StaffKind; label: string; icon: LucideIcon; effect: string }[] = [
  { key: 'coaching', label: '총괄 코치', icon: ClipboardList, effect: '세부 코치가 없는 포지션의 성장률을 대신 담당' },
  { key: 'medical', label: '의료', icon: Stethoscope, effect: '부상 확률·기간 감소, 컨디션 회복 향상' },
  { key: 'scouting', label: '스카우팅', icon: Search, effect: '이적 매물 잠재력 정확도 + 아카데미 해외 네트워크 확장' },
  { key: 'youth', label: '유스', icon: GraduationCap, effect: '매 시즌 아카데미 유망주 배출 수·잠재력 향상' },
  { key: 'coachGk', label: 'GK 코치', icon: Hand, effect: '골키퍼 성장률 향상' },
  { key: 'coachAttack', label: '공격 코치', icon: Target, effect: '공격수·미드필더 성장률 향상' },
  { key: 'coachDefense', label: '수비 코치', icon: Shield, effect: '수비수·미드필더 성장률 향상' },
  { key: 'coachPhysical', label: '피지컬 코치', icon: Dumbbell, effect: '전 포지션 성장률에 보조로 반영' },
  { key: 'reserveCoach', label: '리저브 전담 코치', icon: Users, effect: '리저브(2군) 선수의 성장률을 총괄/세부 코치보다 훨씬 크게 좌우' },
];

function levelOf(staff: Club['staff'], kind: StaffKind): number {
  if (kind === 'reserveCoach') return staff.reserveCoach ?? staff.coaching;
  return (SPECIALIST_KINDS as StaffKind[]).includes(kind)
    ? specialistCoachLevel(staff, kind as SpecialistCoachKind)
    : (staff[kind as NamedStaffKind] as number);
}

/** 부상 위험도 등급별 표시(신규 개선 항목 20). */
const INJURY_RISK_LABEL: Record<InjuryRiskTier, { text: string; cls: string }> = {
  low: { text: '낮음', cls: 'cond-good' },
  medium: { text: '보통', cls: '' },
  high: { text: '높음', cls: 'injury' },
  veryHigh: { text: '매우 높음', cls: 'injury' },
};

/** 리포트에 표시할 최대 인원 — 스쿼드 전체가 아니라 위험도 상위만 보여준다. */
const INJURY_RISK_REPORT_SIZE = 8;

/** 스태프 이적시장(고도화 항목10) — 라이벌 구단이 보유한 실명 스태프를 영입 제안한다. */
function StaffMarketPanel({ game, onPoachStaff }: {
  game: GameState;
  onPoachStaff: (targetClubId: string, kind: NamedStaffKind, attempt: number) => ActionOutcome;
}) {
  const toast = useResultToast();
  const club = myClub(game);
  const [kind, setKind] = useState<NamedStaffKind>('coaching');
  const [attempts, setAttempts] = useState<Record<string, number>>({});

  const candidates = game.clubs
    .filter((c) => c.id !== game.myClubId)
    .map((c) => ({ club: c, member: c.staff.members?.[kind], level: c.staff[kind] }))
    .filter((c): c is { club: typeof c.club; member: NonNullable<typeof c.member>; level: number } => c.member !== undefined)
    .sort((a, b) => b.level - a.level)
    .slice(0, 10);

  return (
    <div className="mentor-panel">
      <h3>🔁 스태프 이적시장</h3>
      <div className="mentor-form">
        <select value={kind} onChange={(e) => setKind(e.target.value as NamedStaffKind)}>
          {NAMED_KINDS.map((k) => <option key={k} value={k}>{STAFF_LABEL[k]}</option>)}
        </select>
      </div>
      {candidates.length === 0 ? (
        <p className="muted small">다른 구단에 영입할 만한 인물이 없습니다.</p>
      ) : (
        <table className="data-table compact">
          <thead>
            <tr><th>구단</th><th>인물</th><th>레벨</th><th>특기</th><th>이적료</th><th></th></tr>
          </thead>
          <tbody>
            {candidates.map(({ club: c, member, level }) => {
              const fee = staffMarketValue(level, member);
              const key = `${c.id}:${kind}`;
              const attempt = attempts[key] ?? 0;
              return (
                <tr key={c.id}>
                  <td className="name">{c.name}</td>
                  <td>{member.name}</td>
                  <td>{level}</td>
                  <td className="muted small">
                    {member.trait
                      ? `${STAFF_TRAIT_TIER_LABEL[member.traitTier ?? 'veteran']} ${STAFF_TRAIT_LABEL[member.trait]}`
                      : '—'}
                  </td>
                  <td>{formatMoney(fee)}</td>
                  <td>
                    <button
                      className="btn-small"
                      disabled={club.finance.balance < fee}
                      onClick={() => {
                        const r = onPoachStaff(c.id, kind, attempt);
                        toast(r);
                        setAttempts((prev) => ({ ...prev, [key]: attempt + 1 }));
                      }}
                    >
                      영입 제안
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="muted small">
        특기 있는 인재는 원 소속 구단이 더 자주 거절합니다. 거절돼도 다시 시도할 수 있습니다.
      </p>
    </div>
  );
}

export function Staff({
  game, onUpgrade, onUpgradeStadium, onUpgradeAcademy, onUpgradeTrainingGround, onNegotiateRaise, onSetAcademyFocus,
  onSignSponsorContract, onPoachStaff,
}: Props) {
  const club = myClub(game);
  const toast = useResultToast();

  const staffWage =
    (club.staff.coaching + club.staff.medical + club.staff.scouting + club.staff.youth) * 600;

  const stadiumLevel = club.finance.stadiumLevel ?? 0;
  const stadiumMaxed = stadiumLevel >= STADIUM_MAX;
  const stadiumCost = stadiumMaxed ? 0 : stadiumUpgradeCost(stadiumLevel);
  const stadiumAfford = club.finance.balance >= stadiumCost;

  const academyLevel = club.finance.academyLevel ?? 0;
  const academyMaxed = academyLevel >= ACADEMY_MAX;
  const academyCost = academyMaxed ? 0 : academyUpgradeCost(academyLevel);
  const academyAfford = club.finance.balance >= academyCost;

  const trainingGroundLevel = club.finance.trainingGroundLevel ?? 0;
  const trainingGroundMaxed = trainingGroundLevel >= TRAINING_GROUND_MAX;
  const trainingGroundCost = trainingGroundMaxed ? 0 : trainingGroundUpgradeCost(trainingGroundLevel);
  const trainingGroundAfford = club.finance.balance >= trainingGroundCost;

  const injuryRiskReport = buildInjuryRiskReport(club).slice(0, INJURY_RISK_REPORT_SIZE);
  const injuryRecoveryReport = buildInjuryRecoveryReport(club);

  const sponsorContracts = club.finance.sponsorContracts ?? [];

  const synergy = staffTraitSynergyBonus(club.staff);
  const traitedCount = NAMED_KINDS.filter((k) => club.staff.members?.[k]?.trait).length;

  return (
    <div className="staff">
      <div className="staff-head">
        <div>
          <span className="muted">보유 자금</span>{' '}
          <b className="budget">{formatMoney(club.finance.balance)}</b>
          <span className="muted"> · 스태프 연봉 {formatMoney(staffWage)}/시즌</span>
        </div>
        {synergy > 0 && (
          <div className="staff-synergy">
            ✨ 스태프 시너지: 특기 보유 {traitedCount}명 → 전 코칭·의료·스카우팅·유스 유효 레벨 +{synergy}
          </div>
        )}
      </div>

      <div className="staff-cards">
        {STAFF.map((s) => {
          const level = levelOf(club.staff, s.key);
          const maxed = level >= STAFF_MAX;
          const cost = maxed ? 0 : upgradeCost(level);
          const afford = club.finance.balance >= cost;
          const member = (NAMED_KINDS as StaffKind[]).includes(s.key)
            ? club.staff.members?.[s.key as NamedStaffKind]
            : undefined;
          return (
            <div className="staff-card" key={s.key}>
              <div className="staff-icon"><s.icon size={32} strokeWidth={1.75} /></div>
              <div className="staff-name">{s.label}</div>
              {member && (
                <div className="staff-member muted small">
                  {member.name} · {member.age}세 · 계약 {member.contractYears}년
                  {member.trait && (
                    <span
                      className={`staff-trait staff-trait-${member.traitTier ?? 'veteran'}`}
                      title={`${STAFF_TRAIT_DESC[member.trait]} (${STAFF_TRAIT_TIER_LABEL[member.traitTier ?? 'veteran']} 등급, +${STAFF_TRAIT_TIER_BONUS[member.traitTier ?? 'veteran']})`}
                    >
                      ✨ {STAFF_TRAIT_TIER_LABEL[member.traitTier ?? 'veteran']} {STAFF_TRAIT_LABEL[member.trait]}
                    </span>
                  )}
                </div>
              )}
              {member && member.age >= STAFF_RETIRE_MIN_AGE && (
                <p className="muted small">🎂 고령으로 시즌 종료 시 은퇴할 수 있습니다.</p>
              )}
              {member && member.contractYears <= STAFF_RAISE_ELIGIBLE_YEARS && (
                <div className="staff-raise">
                  <p className="muted small">
                    계약 만료가 임박했습니다. 연봉 인상을 수락하지 않으면 시즌 종료 시 타 구단으로 이탈할 수 있습니다.
                  </p>
                  <button
                    className="btn-small"
                    disabled={club.finance.balance < staffRaiseCost(level)}
                    onClick={() => toast(onNegotiateRaise(s.key as NamedStaffKind))}
                  >
                    연봉 인상 수락 ({formatMoney(staffRaiseCost(level))})
                  </button>
                </div>
              )}
              <div className="staff-level">
                Lv. <b>{level}</b> / {STAFF_MAX}
              </div>
              <div className="staff-bar">
                <div className="staff-bar-fill" style={{ width: `${(level / STAFF_MAX) * 100}%` }} />
              </div>
              <div className="staff-effect muted">{s.effect}</div>
              <button
                className="btn-advance staff-btn"
                disabled={maxed || !afford}
                onClick={() => toast(onUpgrade(s.key))}
              >
                {maxed ? '최고 레벨' : `업그레이드 (${formatMoney(cost)})`}
              </button>
            </div>
          );
        })}

        <div className="staff-card">
          <div className="staff-icon"><Landmark size={32} strokeWidth={1.75} /></div>
          <div className="staff-name">스타디움</div>
          <div className="staff-level">
            Lv. <b>{stadiumLevel}</b> / {STADIUM_MAX}
          </div>
          <div className="staff-bar">
            <div className="staff-bar-fill" style={{ width: `${(stadiumLevel / STADIUM_MAX) * 100}%` }} />
          </div>
          <div className="staff-effect muted">
            매치데이 수익 상한 +{Math.round((stadiumMatchdayMultiplier(stadiumLevel) - 1) * 100)}%
            {!stadiumMaxed && ' (다음 단계 +5%p)'}
          </div>
          <button
            className="btn-advance staff-btn"
            disabled={stadiumMaxed || !stadiumAfford}
            onClick={() => toast(onUpgradeStadium())}
          >
            {stadiumMaxed ? '최고 규모' : `증축 (${formatMoney(stadiumCost)})`}
          </button>
        </div>

        <div className="staff-card">
          <div className="staff-icon"><School size={32} strokeWidth={1.75} /></div>
          <div className="staff-name">아카데미 시설</div>
          <div className="staff-level">
            Lv. <b>{academyLevel}</b> / {ACADEMY_MAX}
          </div>
          <div className="staff-bar">
            <div className="staff-bar-fill" style={{ width: `${(academyLevel / ACADEMY_MAX) * 100}%` }} />
          </div>
          <div className="staff-effect muted">
            유스 인테이크 잠재력 +{academyPotentialBonus(academyLevel)} (유스 스태프와 별개)
            {!academyMaxed && ` (다음 단계 +${academyPotentialBonus(academyLevel + 1) - academyPotentialBonus(academyLevel)})`}
          </div>
          <div className="academy-focus">
            <div className="muted small">
              포지션 특화{club.finance.academyFocus && ` (Lv.${academyLevel} → +${academyLevel * ACADEMY_FOCUS_POTENTIAL_BONUS_PER_LEVEL} 잠재력)`}
            </div>
            <div className="academy-focus-options">
              {ACADEMY_FOCUS_OPTIONS.map((f) => (
                <button
                  key={f.key}
                  className={`chip${club.finance.academyFocus === f.key ? ' active' : ''}`}
                  onClick={() => onSetAcademyFocus(club.finance.academyFocus === f.key ? undefined : f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn-advance staff-btn"
            disabled={academyMaxed || !academyAfford}
            onClick={() => toast(onUpgradeAcademy())}
          >
            {academyMaxed ? '최고 시설' : `증축 (${formatMoney(academyCost)})`}
          </button>
        </div>

        <div className="staff-card">
          <div className="staff-icon"><Activity size={32} strokeWidth={1.75} /></div>
          <div className="staff-name">훈련장 시설</div>
          <div className="staff-level">
            Lv. <b>{trainingGroundLevel}</b> / {TRAINING_GROUND_MAX}
          </div>
          <div className="staff-bar">
            <div className="staff-bar-fill" style={{ width: `${(trainingGroundLevel / TRAINING_GROUND_MAX) * 100}%` }} />
          </div>
          <div className="staff-effect muted">
            경기당 부상 확률 −{Math.round((1 - trainingGroundInjuryFactor(trainingGroundLevel)) * 100)}% (의료 스태프와 별개)
            {!trainingGroundMaxed &&
              ` (다음 단계 −${Math.round((trainingGroundInjuryFactor(trainingGroundLevel) - trainingGroundInjuryFactor(trainingGroundLevel + 1)) * 100)}%p)`}
          </div>
          <button
            className="btn-advance staff-btn"
            disabled={trainingGroundMaxed || !trainingGroundAfford}
            onClick={() => toast(onUpgradeTrainingGround())}
          >
            {trainingGroundMaxed ? '최고 시설' : `증축 (${formatMoney(trainingGroundCost)})`}
          </button>
        </div>
      </div>

      <StaffMarketPanel game={game} onPoachStaff={onPoachStaff} />

      <div className="injury-risk-report">
        <h3>
          🩺 의료진 부상 예측 리포트
          <InfoTip title="부상 예측 리포트">
            의료 스태프 레벨·선수 특성(부상 잦음/강철 체력)·훈련 포커스·최근 복귀 후 재부상
            위험 구간을 종합해 다음 경기 부상 발생 확률을 예측합니다. 실제 판정과 같은
            공식을 그대로 사용하지만, 결과 자체를 바꾸지는 않는 참고용 수치입니다.
          </InfoTip>
        </h3>
        {injuryRiskReport.length === 0 ? (
          <p className="muted small">현재 위험도를 계산할 수 있는 선수가 없습니다.</p>
        ) : (
          injuryRiskReport.map((r) => (
            <div className="bar-row" key={r.playerId}>
              <span className="bar-label">
                {r.name}({r.position})
                {r.isInjuryProne && ' 🤕'}
                {r.isIronMan && ' 💪'}
                {r.reinjuryWindowRemaining > 0 && ' 🔁'}
              </span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100, r.riskPerMatch * 400)}%` }} />
              </div>
              <span className={`bar-val ${INJURY_RISK_LABEL[r.tier].cls}`}>
                {INJURY_RISK_LABEL[r.tier].text}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="injury-recovery-report">
        <h3>
          🩹 부상자 명단
          <InfoTip title="부상 회복 진행 현황">
            현재 부상으로 결장 중인 선수의 회복 진행률입니다(신규 개선 항목 28). 부상 발생
            시점의 총 결장 경기 수 대비 얼마나 회복됐는지를 보여주며, 실제 복귀 시점을
            바꾸지는 않는 참고용 수치입니다.
          </InfoTip>
        </h3>
        {injuryRecoveryReport.length === 0 ? (
          <p className="muted small">현재 부상 중인 선수가 없습니다.</p>
        ) : (
          injuryRecoveryReport.map((r) => (
            <div className="bar-row" key={r.playerId}>
              <span className="bar-label" title={r.injuryName}>{r.name}({r.position})</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.round(r.progress * 100)}%` }} />
              </div>
              <span className="bar-val">
                {r.remainingMatches}/{r.totalMatches}경기 남음
              </span>
            </div>
          ))
        )}
      </div>

      <div className="sponsor-contracts">
        <h3>
          <Handshake size={18} strokeWidth={1.75} /> 스폰서 계약
          <InfoTip title="스폰서 계약">
            체결하면 수수료가 즉시 빠지는 대신, 이후 {SPONSOR_CONTRACT_LENGTH_SEASONS}시즌 동안
            성적과 무관하게 매 시즌 고정 수익이 들어옵니다. 수익은 체결 시점 평판(스타디움
            명명권은 스타디움 규모도)에 고정되니, 평판이 더 오를 것 같다면 기다렸다 체결하는
            편이 유리할 수 있습니다. 만료되면 재계약해야 수익이 이어집니다.
          </InfoTip>
        </h3>
        <div className="staff-cards">
          {SPONSOR_CONTRACT_KINDS.map((kind) => {
            const active = sponsorContracts.find((c) => c.kind === kind);
            const previewPayout = sponsorContractPayout(kind, club.finance.reputation, club.finance.stadiumLevel);
            const previewCost = Math.round(previewPayout * SPONSOR_CONTRACT_SIGN_FEE_MULTIPLIER);
            const stadiumTooLow = kind === 'stadiumNaming'
              && (club.finance.stadiumLevel ?? 0) < SPONSOR_CONTRACT_STADIUM_MIN_LEVEL;
            const canAfford = club.finance.balance >= previewCost;
            return (
              <div className="staff-card" key={kind}>
                <div className="staff-icon"><Handshake size={32} strokeWidth={1.75} /></div>
                <div className="staff-name">{SPONSOR_CONTRACT_LABEL[kind]}</div>
                {active ? (
                  <div className="staff-effect muted">
                    계약 중 — 잔여 <b>{active.seasonsRemaining}</b>시즌, 시즌당 +{formatMoney(active.payoutPerSeason)}
                  </div>
                ) : stadiumTooLow ? (
                  <div className="staff-effect muted">
                    스타디움을 Lv.{SPONSOR_CONTRACT_STADIUM_MIN_LEVEL} 이상 증축해야 체결 가능
                  </div>
                ) : (
                  <div className="staff-effect muted">
                    체결 시 시즌당 +{formatMoney(previewPayout)} ({SPONSOR_CONTRACT_LENGTH_SEASONS}시즌)
                  </div>
                )}
                <button
                  className="btn-advance staff-btn"
                  disabled={!!active || stadiumTooLow || !canAfford}
                  onClick={() => toast(onSignSponsorContract(kind))}
                >
                  {active ? '계약 중' : `체결 (${formatMoney(previewCost)})`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
