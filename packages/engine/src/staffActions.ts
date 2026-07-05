/**
 * 스태프 업그레이드 (경영).
 * 보유 자금으로 코칭(총괄/세부 4종)·의료·스카우팅·유스를 한 단계씩 올린다.
 * 업그레이드는 레벨만 올리는 게 아니라 coaching/medical/scouting/youth 4개 "실명"
 * 직책은 새 인물을 영입하는 것으로 취급해 이름·나이·계약기간이 함께 갱신된다.
 * 비용은 레벨에 따라 증가.
 */
import type { Club, Position, Staff, StaffMember, StaffTrait } from './types.js';
import { FIRST, LAST } from './names.js';
import { lineOf } from './teamStrength.js';
import type { Rng } from './rng.js';

/** 세부 코치 4종 — GK/공격/수비/피지컬. 미도입(undefined) 시 총괄 coaching 레벨로 대체된다. */
export type SpecialistCoachKind = 'coachGk' | 'coachAttack' | 'coachDefense' | 'coachPhysical';
export const SPECIALIST_COACH_KINDS: SpecialistCoachKind[] = [
  'coachGk', 'coachAttack', 'coachDefense', 'coachPhysical',
];

export type StaffKind = 'coaching' | 'medical' | 'scouting' | 'youth' | SpecialistCoachKind | 'reserveCoach';
export const STAFF_KINDS: StaffKind[] = [
  'coaching', 'medical', 'scouting', 'youth', ...SPECIALIST_COACH_KINDS, 'reserveCoach',
];

/** 실명 인물이 배정되는 직책(원래 4대 스태프만 — 세부 코치는 총괄 코치 산하 보직으로 취급). */
export type NamedStaffKind = 'coaching' | 'medical' | 'scouting' | 'youth';
export const NAMED_STAFF_KINDS: NamedStaffKind[] = ['coaching', 'medical', 'scouting', 'youth'];

export const STAFF_MAX = 20;
const STAFF_CONTRACT_YEARS_MAX = 4;
const STAFF_AGE_MIN = 32;
const STAFF_AGE_RANGE = 28; // 32~59세

/** 직책별로 나올 수 있는 특기 특성 — 한 직책당 하나씩(A6). */
const STAFF_TRAIT_BY_KIND: Record<NamedStaffKind, StaffTrait> = {
  coaching: 'developmentGuru', medical: 'rehabSpecialist', scouting: 'eyeForTalent', youth: 'academyMaestro',
};

export const STAFF_TRAIT_LABEL: Record<StaffTrait, string> = {
  developmentGuru: '성장 전문가', rehabSpecialist: '재활 전문가',
  eyeForTalent: '유망주 안목', academyMaestro: '아카데미 명장',
};

export const STAFF_TRAIT_DESC: Record<StaffTrait, string> = {
  developmentGuru: '지도받는 선수들의 시즌 성장 속도가 더 빠릅니다.',
  rehabSpecialist: '부상 회복 기간과 재부상 위험이 한층 더 줄어듭니다.',
  eyeForTalent: '유스 인테이크의 국적 다양성과 스카우팅 정확도가 더 넓어집니다.',
  academyMaestro: '아카데미가 배출하는 유망주의 잠재력이 한층 더 높아집니다.',
};

/** 새로 영입된 인물이 특기 특성을 가질 확률(같은 조합이면 항상 같은 결과 — 결정론적). */
const STAFF_TRAIT_CHANCE = 0.45;
/** 특기 특성이 주는 유효 레벨 가산치. */
export const STAFF_TRAIT_BONUS = 2;

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
  // 특기 특성 — 이름/나이와 별개 해시로 판정(같은 조합이면 항상 같은 결과).
  const traitRoll = hashSeed(`${clubId}:${kind}:${level}:trait`) / 0xFFFFFFFF;
  const trait = traitRoll < STAFF_TRAIT_CHANCE ? STAFF_TRAIT_BY_KIND[kind] : undefined;
  return { name: `${first} ${last}`, age, contractYears, trait };
}

/** 계약 만료로 이탈한 실명 스태프의 후임을 뽑는다. hireStaffMember와 달리 rng로 뽑은
 *  salt를 시드에 섞어, 같은 clubId·직책·레벨이라도 매번 다른 인물이 나오도록 한다
 *  (hireStaffMember 자체를 건드리면 초기 배정·업그레이드 호출부의 결정론적 인물이
 *  전부 바뀌므로, 이 호출부만을 위한 별도 해시 네임스페이스를 둔다). */
function hireReplacementStaffMember(clubId: string, kind: NamedStaffKind, level: number, rng: Rng): StaffMember {
  const salt = rng.int(0, 0xFFFFFFFF);
  const seed = hashSeed(`${clubId}:${kind}:${level}:replacement:${salt}`);
  const first = FIRST[seed % FIRST.length]!;
  const last = LAST[Math.floor(seed / FIRST.length) % LAST.length]!;
  const age = STAFF_AGE_MIN + (seed % STAFF_AGE_RANGE);
  const contractYears = 1 + (seed % STAFF_CONTRACT_YEARS_MAX);
  const traitRoll = hashSeed(`${clubId}:${kind}:${level}:replacement:${salt}:trait`) / 0xFFFFFFFF;
  const trait = traitRoll < STAFF_TRAIT_CHANCE ? STAFF_TRAIT_BY_KIND[kind] : undefined;
  return { name: `${first} ${last}`, age, contractYears, trait };
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
  const base = posLevel * 0.7 + physLevel * 0.3;
  const bonus = staff.members?.coaching?.trait === 'developmentGuru' ? STAFF_TRAIT_BONUS : 0;
  return base + bonus + staffTraitSynergyBonus(staff);
}

/** 리저브(2군) 성장 계산에 쓰이는 유효 코칭 레벨. 전담 리저브 코치를 도입하지 않은
 *  구단(구버전 세이브 포함)은 정확히 effectiveCoaching과 같아(하위 호환), 도입 시엔
 *  포지션별 세부 코치(30%)보다 전담 리저브 코치(70%)가 훨씬 크게 반영된다. */
export function effectiveReserveCoaching(position: Position, staff: Staff): number {
  if (staff.reserveCoach === undefined) return effectiveCoaching(position, staff);
  const posLevel = positionCoachLevel(position, staff);
  return posLevel * 0.3 + staff.reserveCoach * 0.7 + staffTraitSynergyBonus(staff);
}

/** 의료 유효 레벨 — 재활 전문가(rehabSpecialist) 특기가 있으면 가산 보너스. */
export function effectiveMedical(staff: Staff): number {
  const bonus = staff.members?.medical?.trait === 'rehabSpecialist' ? STAFF_TRAIT_BONUS : 0;
  return staff.medical + bonus + staffTraitSynergyBonus(staff);
}

/** 스카우팅 유효 레벨 — 유망주 안목(eyeForTalent) 특기가 있으면 가산 보너스. */
export function effectiveScouting(staff: Staff): number {
  const bonus = staff.members?.scouting?.trait === 'eyeForTalent' ? STAFF_TRAIT_BONUS : 0;
  return staff.scouting + bonus + staffTraitSynergyBonus(staff);
}

/** 유스 유효 레벨 — 아카데미 명장(academyMaestro) 특기가 있으면 가산 보너스. */
export function effectiveYouth(staff: Staff): number {
  const bonus = staff.members?.youth?.trait === 'academyMaestro' ? STAFF_TRAIT_BONUS : 0;
  return staff.youth + bonus + staffTraitSynergyBonus(staff);
}

/** 특기 특성을 가진 실명 스태프 수에 따른 시너지 가산치(B12) — 핵심 스태프진이 여럿
 *  손발이 맞으면(특기 보유자 2명 이상) 개별 보너스와 별개로 팀 전체에 추가 보너스가
 *  붙는다. 특기 보유자가 0~1명이면 0(기존과 동일 — 하위 호환). */
const STAFF_SYNERGY_BONUS_BY_COUNT: Record<number, number> = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3 };
export function staffTraitSynergyBonus(staff: Staff): number {
  const count = NAMED_STAFF_KINDS.reduce((n, kind) => n + (staff.members?.[kind]?.trait ? 1 : 0), 0);
  return STAFF_SYNERGY_BONUS_BY_COUNT[count] ?? 0;
}

/** 실명 스태프가 계약 만료 시 이탈할 기준 확률 — 레벨이 높을수록(시장 가치가 높을수록)
 *  스카우트당하기 쉬워 이탈 확률도 함께 오른다. */
const STAFF_DEPARTURE_BASE_CHANCE = 0.12;
const STAFF_DEPARTURE_PER_LEVEL = 0.015;
const STAFF_DEPARTURE_MAX_CHANCE = 0.45;

/** 실명 스태프 계약 만료 시 이탈 이벤트. */
export interface StaffDepartureEvent {
  kind: NamedStaffKind;
  name: string;
  replacementName: string;
}

/** 오프시즌 경계에 실명 스태프의 잔여 계약을 1년 감소시킨다. 0이 되면 레벨에 비례한
 *  확률로 타 구단에 스카우트되어 이탈하며, 이 경우 즉시 같은 자리에 새 인물을 영입해
 *  공백 없이 채운다. 이탈하지 않으면 기존과 동일하게 조용히 재계약한다. */
export function tickStaffContracts(club: Club, rng: Rng): StaffDepartureEvent[] {
  if (!club.staff.members) return [];
  const departures: StaffDepartureEvent[] = [];
  for (const kind of NAMED_STAFF_KINDS) {
    const m = club.staff.members[kind];
    if (!m) continue;
    m.contractYears -= 1;
    if (m.contractYears <= 0) {
      const level = club.staff[kind];
      const chance = Math.min(STAFF_DEPARTURE_MAX_CHANCE, STAFF_DEPARTURE_BASE_CHANCE + level * STAFF_DEPARTURE_PER_LEVEL);
      if (rng.roll(chance)) {
        const departedName = m.name;
        const replacement = hireReplacementStaffMember(club.id, kind, level, rng);
        club.staff.members[kind] = replacement;
        departures.push({ kind, name: departedName, replacementName: replacement.name });
        continue;
      }
      const seed = hashSeed(`${club.id}:${kind}:${club.staff[kind]}:renew:${m.age}`);
      m.contractYears = 1 + (seed % STAFF_CONTRACT_YEARS_MAX);
    }
  }
  return departures;
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
