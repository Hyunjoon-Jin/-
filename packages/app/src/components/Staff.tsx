import {
  ClipboardList, Stethoscope, Search, GraduationCap, Hand, Target, Shield, Dumbbell,
  type LucideIcon,
} from 'lucide-react';
import { myClub, type GameState, type ActionOutcome } from '../game.js';
import {
  upgradeCost, STAFF_MAX, formatMoney, specialistCoachLevel, STAFF_TRAIT_LABEL, STAFF_TRAIT_DESC,
  type StaffKind, type SpecialistCoachKind, type NamedStaffKind, type Club,
} from '@soccer-tycoon/engine';
import { useResultToast } from '../toast.js';

interface Props {
  game: GameState;
  onUpgrade: (kind: StaffKind) => ActionOutcome;
}

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
];

function levelOf(staff: Club['staff'], kind: StaffKind): number {
  return (SPECIALIST_KINDS as StaffKind[]).includes(kind)
    ? specialistCoachLevel(staff, kind as SpecialistCoachKind)
    : (staff[kind as NamedStaffKind] as number);
}

export function Staff({ game, onUpgrade }: Props) {
  const club = myClub(game);
  const toast = useResultToast();

  const staffWage =
    (club.staff.coaching + club.staff.medical + club.staff.scouting + club.staff.youth) * 600;

  return (
    <div className="staff">
      <div className="staff-head">
        <div>
          <span className="muted">보유 자금</span>{' '}
          <b className="budget">{formatMoney(club.finance.balance)}</b>
          <span className="muted"> · 스태프 연봉 {formatMoney(staffWage)}/시즌</span>
        </div>
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
                    <span className="staff-trait" title={STAFF_TRAIT_DESC[member.trait]}>
                      ✨ {STAFF_TRAIT_LABEL[member.trait]}
                    </span>
                  )}
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
      </div>
    </div>
  );
}
