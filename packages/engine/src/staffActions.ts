/**
 * 스태프 업그레이드 (경영).
 * 보유 자금으로 코칭(총괄/세부 4종)·의료·스카우팅·유스를 한 단계씩 올린다.
 * 업그레이드는 레벨만 올리는 게 아니라 coaching/medical/scouting/youth 4개 "실명"
 * 직책은 새 인물을 영입하는 것으로 취급해 이름·나이·계약기간이 함께 갱신된다.
 * 비용은 레벨에 따라 증가.
 */
import type { Club, Position, Staff, StaffMember } from './types.js';
import { FIRST, LAST } from './names.js';
import { lineOf } from './teamStrength.js';

/** 세부 코치 4종 — GK/공격/수비/피지컬. 미도입(undefined) 시 총괄 coaching 레벨로 대체된다. */
export type SpecialistCoachKind = 'coachGk' | 'coachAttack' | 'coachDefense' | 'coachPhysical';
export const SPECIALIST_COACH_KINDS: SpecialistCoachKind[] = [
  'coachGk', 'coachAttack', 'coachDefense', 'coachPhysical',
];

export type StaffKind = 'coaching' | 'medical' | 'scouting' | 'youth' | SpecialistCoachKind;
export const STAFF_KINDS: StaffKind[] = ['coaching', 'medical', 'scouting', 'youth', ...SPECIALIST_COACH_KINDS];

/** 실명 인물이 배정되는 직책(원래 4대 스태프만 — 세부 코치는 총괄 코치 산하 보직으로 취급). */
export type NamedStaffKind = 'coaching' | 'medical' | 'scouting' | 'youth';
export const NAMED_STAFF_KINDS: NamedStaffKind[] = ['coaching', 'medical', 'scouting', 'youth'];

export const STAFF_MAX = 20;
const STAFF_CONTRACT_YEARS_MAX = 4;
const STAFF_AGE_MIN = 32;
const STAFF_AGE_RANGE = 28; // 32~59세

/** 문자열 → 32비트 해시(결정론적, RNG 불필요 — 유저 액션(업그레이드)엔 Rng 컨텍스트가 없다). */
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** clubId·직책·레벨을 시드로 결정론적인 "새 인물"을 뽑는다 — 같은 조합이면 항상 같은 사람. */
function hireStaffMember(clubId: string, kind: NamedStaffKind, level: number): StaffMember {
  const seed = hashSeed(`${clubId}:${kind}:${level}`);
  const first = FIRST[seed % FIRST.length]!;
  const last = LAST[Math.floor(seed / FIRST.length) % LAST.length]!;
  const age = STAFF_AGE_MIN + (seed % STAFF_AGE_RANGE);
  const contractYears = 1 + (seed % STAFF_CONTRACT_YEARS_MAX);
  return { name: `${first} ${last}`, age, contractYears };
}

/** 구단 생성 시 4대 실명 스태프를 초기 레벨 그대로 배정. */
export function hireInitialStaffMembers(clubId: string, staff: Staff): Partial<Record<NamedStaffKind, StaffMember>> {
  const members: Partial<Record<NamedStaffKind, StaffMember>> = {};
  for (const kind of NAMED_STAFF_KINDS) members[kind] = hireStaffMember(clubId, kind, staff[kind]);
  return members;
}

/** 세부 코치 레벨 — 미도입(undefined)이면 총괄 coaching 레벨로 대체(하위 호환). */
export function specialistCoachLevel(staff: Staff, kind: SpecialistCoachKind): number {
  return staff[kind] ?? staff.coaching;
}

/** 포지션 라인에 맞는 세부 코치 레벨(GK는 GK코치, MID는 공격/수비 코치의 평균). */
function positionCoachLevel(position: Position, staff: Staff): number {
  if (position === 'GK') return specialistCoachLevel(staff, 'coachGk');
  const line = lineOf(position);
  if (line === 'ATT') return specialistCoachLevel(staff, 'coachAttack');
  if (line === 'DEF') return specialistCoachLevel(staff, 'coachDefense');
  return (specialistCoachLevel(staff, 'coachAttack') + specialistCoachLevel(staff, 'coachDefense')) / 2;
}

/**
 * 성장 계산에 실제로 쓰이는 "유효 코칭 레벨" — 포지션에 맞는 세부 코치(70%)와
 * 피지컬 코치(30%)를 블렌드한다. 세부 코치가 전혀 도입되지 않은 구단(구버전 세이브
 * 포함)은 모든 specialistCoachLevel이 staff.coaching으로 대체되므로 결과가 정확히
 * staff.coaching과 같아져(0.7+0.3=1.0) 하위 호환이 완전히 보장된다.
 */
export function effectiveCoaching(position: Position, staff: Staff): number {
  const posLevel = positionCoachLevel(position, staff);
  const physLevel = specialistCoachLevel(staff, 'coachPhysical');
  return posLevel * 0.7 + physLevel * 0.3;
}

/** 오프시즌 경계에 실명 스태프의 잔여 계약을 1년 감소시키고, 0이 되면 조용히 재계약한다
 *  (계약 만료로 인한 이탈·협상 드라마는 후속 확장(스태프 계약·타 구단 스카우트) 몫). */
export function tickStaffContracts(club: Club): void {
  if (!club.staff.members) return;
  for (const kind of NAMED_STAFF_KINDS) {
    const m = club.staff.members[kind];
    if (!m) continue;
    m.contractYears -= 1;
    if (m.contractYears <= 0) {
      const seed = hashSeed(`${club.id}:${kind}:${club.staff[kind]}:renew:${m.age}`);
      m.contractYears = 1 + (seed % STAFF_CONTRACT_YEARS_MAX);
    }
  }
}

/** 현재 레벨에서 다음 레벨로 올리는 비용 (만원). */
export function upgradeCost(currentLevel: number): number {
  // 레벨 제곱 곡선: 5→3천만, 10→1.2억, 15→2.7억, 19→4.3억
  return currentLevel * currentLevel * 120;
}

export interface UpgradeResult { ok: boolean; cost?: number; newLevel?: number; reason?: string }

/** 스태프 한 단계 업그레이드. 구단 객체를 직접 변경한다.
 *  실명 직책(coaching/medical/scouting/youth)은 레벨이 오르는 동시에 더 나은 인물을
 *  새로 영입한 것으로 취급해 이름·나이·계약기간이 갱신된다. */
export function upgradeStaff(club: Club, kind: StaffKind): UpgradeResult {
  const level = club.staff[kind] ?? club.staff.coaching;
  if (level >= STAFF_MAX) return { ok: false, reason: `이미 최고 레벨(${STAFF_MAX})입니다.` };
  const cost = upgradeCost(level);
  if (club.finance.balance < cost) return { ok: false, reason: '보유 자금이 부족합니다.' };
  club.finance.balance -= cost;
  const newLevel = level + 1;
  club.staff[kind] = newLevel;
  if ((NAMED_STAFF_KINDS as StaffKind[]).includes(kind)) {
    const members = club.staff.members ?? (club.staff.members = {});
    members[kind as NamedStaffKind] = hireStaffMember(club.id, kind as NamedStaffKind, newLevel);
  }
  return { ok: true, cost, newLevel };
}
