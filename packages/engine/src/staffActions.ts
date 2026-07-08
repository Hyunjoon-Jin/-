/**
 * 스태프 업그레이드 (경영).
 * 보유 자금으로 코칭(총괄/세부 4종)·의료·스카우팅·유스를 한 단계씩 올린다.
 * 업그레이드는 레벨만 올리는 게 아니라 coaching/medical/scouting/youth 4개 "실명"
 * 직책은 새 인물을 영입하는 것으로 취급해 이름·나이·계약기간이 함께 갱신된다.
 * 비용은 레벨에 따라 증가.
 */
import type { Club, Position, Staff, StaffMember, StaffTrait, StaffTraitTier } from './types.js';
import { FIRST, LAST } from './names.js';
import { lineOf } from './teamStrength.js';
import type { Rng } from './rng.js';
import { hashSeed } from './math.js';

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
/** 특기 특성이 주는 유효 레벨 가산치(구버전 세이브·등급 미판정 시 기본값 — 등급제
 *  도입 후로는 veteran 등급과 동일한 값으로 취급된다, 고도화 항목9). */
export const STAFF_TRAIT_BONUS = 2;

/** 특기 등급별 가산 보너스(고도화 항목9) — 초급 < 중급(기존 STAFF_TRAIT_BONUS와
 *  동일) < 전설급. */
export const STAFF_TRAIT_TIER_BONUS: Record<StaffTraitTier, number> = {
  novice: 1, veteran: STAFF_TRAIT_BONUS, legend: 4,
};
export const STAFF_TRAIT_TIER_LABEL: Record<StaffTraitTier, string> = {
  novice: '초급', veteran: '중급', legend: '전설급',
};
/** 특기를 가진 인물의 등급 분포 — 초급이 가장 흔하고 전설급이 가장 희소하다. */
const STAFF_TRAIT_TIER_NOVICE_CHANCE = 0.5;
const STAFF_TRAIT_TIER_VETERAN_CHANCE = 0.85; // novice~이 구간까지 veteran, 나머지는 legend

/** 특기 등급 가산 보너스 조회 — trait가 대상 특성과 일치할 때만 등급별 보너스를,
 *  아니면 0을 반환한다(구버전 세이브는 traitTier가 없을 수 있어 veteran 취급). */
function traitTierBonus(member: StaffMember | undefined, trait: StaffTrait): number {
  if (member?.trait !== trait) return 0;
  return STAFF_TRAIT_TIER_BONUS[member.traitTier ?? 'veteran'];
}

/** clubId·직책·레벨을 시드로 결정론적인 "특기 및 등급"을 뽑는다(내부 공용 헬퍼). */
function rollStaffTrait(seedKey: string, kind: NamedStaffKind): { trait?: StaffTrait; traitTier?: StaffTraitTier } {
  const traitRoll = hashSeed(`${seedKey}:trait`) / 0xFFFFFFFF;
  if (traitRoll >= STAFF_TRAIT_CHANCE) return {};
  const tierRoll = hashSeed(`${seedKey}:trait:tier`) / 0xFFFFFFFF;
  const traitTier: StaffTraitTier = tierRoll < STAFF_TRAIT_TIER_NOVICE_CHANCE
    ? 'novice'
    : tierRoll < STAFF_TRAIT_TIER_VETERAN_CHANCE ? 'veteran' : 'legend';
  return { trait: STAFF_TRAIT_BY_KIND[kind], traitTier };
}

/** clubId·직책·레벨을 시드로 결정론적인 "새 인물"을 뽑는다 — 같은 조합이면 항상 같은 사람. */
function hireStaffMember(clubId: string, kind: NamedStaffKind, level: number): StaffMember {
  const seed = hashSeed(`${clubId}:${kind}:${level}`);
  const first = FIRST[seed % FIRST.length]!;
  const last = LAST[Math.floor(seed / FIRST.length) % LAST.length]!;
  const age = STAFF_AGE_MIN + (seed % STAFF_AGE_RANGE);
  const contractYears = 1 + (seed % STAFF_CONTRACT_YEARS_MAX);
  // 특기 특성·등급 — 이름/나이와 별개 해시로 판정(같은 조합이면 항상 같은 결과).
  const { trait, traitTier } = rollStaffTrait(`${clubId}:${kind}:${level}`, kind);
  return { name: `${first} ${last}`, age, contractYears, trait, traitTier };
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
  const { trait, traitTier } = rollStaffTrait(`${clubId}:${kind}:${level}:replacement:${salt}`, kind);
  return { name: `${first} ${last}`, age, contractYears, trait, traitTier };
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
  const bonus = traitTierBonus(staff.members?.coaching, 'developmentGuru');
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
  const bonus = traitTierBonus(staff.members?.medical, 'rehabSpecialist');
  return staff.medical + bonus + staffTraitSynergyBonus(staff);
}

/** 스카우팅 유효 레벨 — 유망주 안목(eyeForTalent) 특기가 있으면 가산 보너스. */
export function effectiveScouting(staff: Staff): number {
  const bonus = traitTierBonus(staff.members?.scouting, 'eyeForTalent');
  return staff.scouting + bonus + staffTraitSynergyBonus(staff);
}

/** 유스 유효 레벨 — 아카데미 명장(academyMaestro) 특기가 있으면 가산 보너스. */
export function effectiveYouth(staff: Staff): number {
  const bonus = traitTierBonus(staff.members?.youth, 'academyMaestro');
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

// ── 스태프 은퇴(신규 개선 항목 17) ───────────────────────────

/** 이 나이부터 매 시즌 확률적으로 은퇴한다(선수와 달리 체력 능력치가 없어 나이만 반영). */
export const STAFF_RETIRE_MIN_AGE = 62;
/** 이 나이 이상이면 확률과 무관하게 은퇴(하드컷). */
export const STAFF_RETIRE_HARD_AGE = 72;

/** 나이에 따른 시즌 후 은퇴 확률(62세=8%, 67세=38%, 71세=68% 기준). 계약 상태와 무관하게
 *  매 시즌 독립적으로 판정한다 — 실제로 계약이 남아 있어도 고령이면 은퇴할 수 있다. */
export function staffRetireChance(age: number): number {
  if (age < STAFF_RETIRE_MIN_AGE) return 0;
  return Math.min(0.95, (age - STAFF_RETIRE_MIN_AGE + 1) * 0.08);
}

/** 실명 스태프 은퇴 이벤트 — 즉시 같은 자리에 새 인물이 영입되어 공백을 메운다. */
export interface StaffRetirementEvent {
  kind: NamedStaffKind;
  name: string;
  finalAge: number;
  replacementName: string;
  /** 은퇴 시점의 직책 레벨(고도화 항목36, 명예의 전당 표시용). */
  level: number;
  trait?: StaffTrait;
  traitTier?: StaffTraitTier;
}

export interface StaffTickResult {
  departures: StaffDepartureEvent[];
  retirements: StaffRetirementEvent[];
}

/** 오프시즌 경계에 실명 스태프를 한 살 더 먹이고, 고령이면 은퇴 여부를 먼저 판정한다.
 *  은퇴하지 않은 인물만 기존과 동일하게 잔여 계약을 1년 감소시켜, 0이 되면 레벨에
 *  비례한 확률로 타 구단에 스카우트되어 이탈한다(은퇴·이탈 모두 즉시 같은 자리에 새
 *  인물을 영입해 공백 없이 채운다). 어느 쪽도 아니면 기존과 동일하게 조용히 재계약한다. */
export function tickStaffContracts(club: Club, rng: Rng): StaffTickResult {
  if (!club.staff.members) return { departures: [], retirements: [] };
  const departures: StaffDepartureEvent[] = [];
  const retirements: StaffRetirementEvent[] = [];
  for (const kind of NAMED_STAFF_KINDS) {
    const m = club.staff.members[kind];
    if (!m) continue;
    m.age += 1;
    const level = club.staff[kind];
    if (m.age >= STAFF_RETIRE_HARD_AGE || rng.roll(staffRetireChance(m.age))) {
      const retiredName = m.name;
      const finalAge = m.age;
      const { trait, traitTier } = m;
      const replacement = hireReplacementStaffMember(club.id, kind, level, rng);
      club.staff.members[kind] = replacement;
      retirements.push({
        kind, name: retiredName, finalAge, replacementName: replacement.name, level, trait, traitTier,
      });
      continue;
    }
    m.contractYears -= 1;
    if (m.contractYears <= 0) {
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
  return { departures, retirements };
}

// ── 코치 계약 협상 (연봉 인상 요구, 신규 개선 항목 12) ───────

/** 연봉 인상 협상을 걸 수 있는 기준 — 잔여 계약이 이 값 이하로 남아야 임박한 것으로 본다. */
export const STAFF_RAISE_ELIGIBLE_YEARS = 1;
/** 연봉 인상 수락 시 부여되는 새 계약 기간(년). */
export const STAFF_RAISE_EXTENSION_YEARS = STAFF_CONTRACT_YEARS_MAX;

/** 연봉 인상 협상 비용(만원) — 레벨이 높을수록(몸값이 비쌀수록) 더 많이 요구한다. */
export function staffRaiseCost(level: number): number {
  return Math.round(2000 * (1 + level * 0.25));
}

export interface StaffRaiseResult {
  ok: boolean;
  reason?: string;
  cost?: number;
  staffName?: string;
  kind?: NamedStaffKind;
}

/**
 * 코치 계약 협상(연봉 인상 요구, 신규 개선 항목 12) — 계약 만료가 임박한(잔여
 * STAFF_RAISE_ELIGIBLE_YEARS년 이하) 실명 스태프의 연봉을 인상해 계약을 연장한다.
 * 수락하지 않고 넘어가면 다음 오프시즌 tickStaffContracts의 확률적 이탈 판정을
 * 그대로 받는다(레벨이 오르는 조합이면 항상 같은 인물이 유지되는 hireStaffMember와
 * 달리, 이 함수는 이름·나이·특기는 그대로 두고 계약 기간만 갱신한다 — 같은 사람을
 * 붙잡아두는 것이 협상의 요점이므로).
 */
export function negotiateStaffRaise(club: Club, kind: NamedStaffKind): StaffRaiseResult {
  const member = club.staff.members?.[kind];
  if (!member) return { ok: false, reason: '해당 직책에 실명 스태프가 없습니다.' };
  if (member.contractYears > STAFF_RAISE_ELIGIBLE_YEARS) {
    return { ok: false, reason: '아직 계약 만료가 임박하지 않았습니다.' };
  }
  const level = club.staff[kind];
  const cost = staffRaiseCost(level);
  if (club.finance.balance < cost) return { ok: false, reason: '보유 자금이 부족합니다.' };
  club.finance.balance -= cost;
  member.contractYears = STAFF_RAISE_EXTENSION_YEARS;
  return { ok: true, cost, staffName: member.name, kind };
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

// ── 스태프 이적시장 (고도화 항목10) ──────────────────────────

/** 스태프 영입 제안 시 지불할 이적료(만원) — 레벨과 특기 등급에 비례한다. */
export function staffMarketValue(level: number, member: StaffMember | undefined): number {
  const base = Math.pow(level / STAFF_MAX, 2) * 500_000;
  const traitMul = member?.trait ? 1 + STAFF_TRAIT_TIER_BONUS[member.traitTier ?? 'veteran'] * 0.1 : 1;
  return Math.round(base * traitMul);
}

/** 특기 없는 인물이 이적 제안을 받아들일 기본 확률. */
const STAFF_POACH_BASE_ACCEPT_CHANCE = 0.7;
/** 특기 있는 인재는 원 소속 구단이 쉽게 놓아주지 않는다. */
const STAFF_POACH_TRAITED_ACCEPT_CHANCE = 0.35;

export interface StaffPoachResult { ok: boolean; reason?: string; fee?: number; poachedName?: string }

/**
 * 다른 구단의 실명 스태프를 영입 제안한다(고도화 항목10) — 이적료를 지불하면
 * 그 인물이 내 구단의 해당 직책으로 옮겨오고, 원 소속 구단에는 같은 레벨의 새
 * 인물이 채워진다. 특기 있는 인재는 상대가 더 자주 거절한다(결정론적 해시).
 * 내 구단의 해당 레벨은 영입한 인물의 레벨보다 낮았다면 그 레벨로 즉시 올라간다.
 */
export function poachStaff(
  clubs: Club[], myClubId: string, targetClubId: string, kind: NamedStaffKind, rng: Rng,
): StaffPoachResult {
  if (myClubId === targetClubId) return { ok: false, reason: '같은 구단에서는 영입할 수 없습니다.' };
  const me = clubs.find((c) => c.id === myClubId);
  const target = clubs.find((c) => c.id === targetClubId);
  if (!me || !target) return { ok: false, reason: '구단을 찾을 수 없습니다.' };
  const targetMember = target.staff.members?.[kind];
  if (!targetMember) return { ok: false, reason: '해당 직책에 영입할 인물이 없습니다.' };
  const targetLevel = target.staff[kind];
  const fee = staffMarketValue(targetLevel, targetMember);
  if (me.finance.balance < fee) return { ok: false, reason: '보유 자금이 부족합니다.' };

  const acceptChance = targetMember.trait ? STAFF_POACH_TRAITED_ACCEPT_CHANCE : STAFF_POACH_BASE_ACCEPT_CHANCE;
  if (!rng.roll(acceptChance)) {
    return { ok: false, reason: `${target.name}이(가) ${targetMember.name}의 이적을 거절했습니다.` };
  }

  me.finance.balance -= fee;
  target.finance.balance += fee;
  target.finance.transferBudget += fee;

  me.staff[kind] = Math.max(me.staff[kind], targetLevel);
  const myMembers = me.staff.members ?? (me.staff.members = {});
  const poachedName = targetMember.name;
  myMembers[kind] = targetMember;

  // hireStaffMember는 clubId·직책·레벨만으로 결정되므로, 레벨이 그대로면 방금
  // 떠난 바로 그 인물을 다시 뽑아버린다. hireReplacementStaffMember(rng 솔트 포함)를
  // 써서 항상 다른 후임이 나오도록 한다.
  const targetMembers = target.staff.members ?? (target.staff.members = {});
  targetMembers[kind] = hireReplacementStaffMember(target.id, kind, targetLevel, rng);

  return { ok: true, fee, poachedName };
}
