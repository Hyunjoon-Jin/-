import { describe, it, expect } from 'vitest';
import {
  hireInitialStaffMembers, effectiveCoaching, effectiveMedical, effectiveScouting, effectiveYouth,
  effectiveReserveCoaching, staffTraitSynergyBonus,
  STAFF_TRAIT_BONUS, STAFF_TRAIT_LABEL, upgradeStaff,
} from '../src/staffActions.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { progressPlayer } from '../src/progression.js';
import { currentAbility } from '../src/derived.js';
import { simulateMatch } from '../src/simulateMatch.js';
import { Rng } from '../src/rng.js';
import type { Player, Staff } from '../src/types.js';

describe('A6: 실명 스태프 특기 특성', () => {
  it('같은 구단id·직책·레벨 조합이면 항상 같은 특기 판정이 나온다(결정론적)', () => {
    const a = hireInitialStaffMembers('club-x', { coaching: 12, medical: 8, scouting: 15, youth: 9 } as Staff);
    const b = hireInitialStaffMembers('club-x', { coaching: 12, medical: 8, scouting: 15, youth: 9 } as Staff);
    expect(a.coaching?.trait).toBe(b.coaching?.trait);
    expect(a.medical?.trait).toBe(b.medical?.trait);
  });

  it('충분히 많은 구단id·레벨 조합을 뽑으면 4개 직책 모두 특기를 가진 인물이 나온다', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const members = hireInitialStaffMembers(`club-${i}`, {
        coaching: 5 + (i % 15), medical: 5 + (i % 15), scouting: 5 + (i % 15), youth: 5 + (i % 15),
      } as Staff);
      for (const kind of ['coaching', 'medical', 'scouting', 'youth'] as const) {
        const trait = members[kind]?.trait;
        if (trait) seen.add(trait);
      }
    }
    expect(seen.has('developmentGuru')).toBe(true);
    expect(seen.has('rehabSpecialist')).toBe(true);
    expect(seen.has('eyeForTalent')).toBe(true);
    expect(seen.has('academyMaestro')).toBe(true);
    // 각 특성은 해당 직책 하나에만 붙는 라벨을 갖는다.
    for (const trait of seen) expect(STAFF_TRAIT_LABEL[trait as keyof typeof STAFF_TRAIT_LABEL]).toBeTruthy();
  });

  it('특기를 가진 코치는 effectiveCoaching이 정확히 STAFF_TRAIT_BONUS만큼 더 높다', () => {
    const base: Staff = { coaching: 10, medical: 10, scouting: 10, youth: 10 };
    const withGuru: Staff = { ...base, members: { coaching: { name: 'A', age: 40, contractYears: 2, trait: 'developmentGuru' } } };
    expect(effectiveCoaching('MC', withGuru)).toBe(effectiveCoaching('MC', base) + STAFF_TRAIT_BONUS);
  });

  it('재활 전문가가 있으면 effectiveMedical이 가산 보너스만큼 높다', () => {
    const base: Staff = { coaching: 10, medical: 10, scouting: 10, youth: 10 };
    const withTrait: Staff = { ...base, members: { medical: { name: 'B', age: 40, contractYears: 2, trait: 'rehabSpecialist' } } };
    expect(effectiveMedical(withTrait)).toBe(effectiveMedical(base) + STAFF_TRAIT_BONUS);
  });

  it('유망주 안목이 있으면 effectiveScouting이, 아카데미 명장이 있으면 effectiveYouth가 가산 보너스만큼 높다', () => {
    const base: Staff = { coaching: 10, medical: 10, scouting: 10, youth: 10 };
    const withScouting: Staff = { ...base, members: { scouting: { name: 'C', age: 40, contractYears: 2, trait: 'eyeForTalent' } } };
    const withYouth: Staff = { ...base, members: { youth: { name: 'D', age: 40, contractYears: 2, trait: 'academyMaestro' } } };
    expect(effectiveScouting(withScouting)).toBe(effectiveScouting(base) + STAFF_TRAIT_BONUS);
    expect(effectiveYouth(withYouth)).toBe(effectiveYouth(base) + STAFF_TRAIT_BONUS);
  });

  it('다른 직책의 특기는 서로 영향을 주지 않는다(교차 오염 없음)', () => {
    const base: Staff = { coaching: 10, medical: 10, scouting: 10, youth: 10 };
    const withMedicalTrait: Staff = { ...base, members: { medical: { name: 'E', age: 40, contractYears: 2, trait: 'rehabSpecialist' } } };
    expect(effectiveCoaching('MC', withMedicalTrait)).toBe(effectiveCoaching('MC', base));
    expect(effectiveScouting(withMedicalTrait)).toBe(effectiveScouting(base));
    expect(effectiveYouth(withMedicalTrait)).toBe(effectiveYouth(base));
  });

  it('성장 전문가 코치가 있으면 같은 조건에서 선수가 더 빨리 성장한다', () => {
    function youngPlayer(): Player {
      const rng = new Rng(1);
      const club = generateClub(rng, 'c', 'C', 12);
      const p = club.players[5]!;
      p.age = 18;
      p.potential = 180;
      for (const k in p.attributes) (p.attributes as Record<string, number>)[k] = 8;
      return p;
    }
    const withoutGuru = youngPlayer();
    const withGuru = youngPlayer();
    progressPlayer(withoutGuru, new Rng(50), effectiveCoaching('MC', { coaching: 10, medical: 10, scouting: 10, youth: 10 }));
    progressPlayer(withGuru, new Rng(50), effectiveCoaching('MC', {
      coaching: 10, medical: 10, scouting: 10, youth: 10,
      members: { coaching: { name: 'F', age: 40, contractYears: 2, trait: 'developmentGuru' } },
    }));
    expect(currentAbility(withGuru)).toBeGreaterThan(currentAbility(withoutGuru));
  });

  it('B12: 특기 보유자가 0~1명이면 시너지 보너스가 없다', () => {
    const base: Staff = { coaching: 10, medical: 10, scouting: 10, youth: 10 };
    const oneTrait: Staff = { ...base, members: { medical: { name: 'X', age: 40, contractYears: 2, trait: 'rehabSpecialist' } } };
    expect(staffTraitSynergyBonus(base)).toBe(0);
    expect(staffTraitSynergyBonus(oneTrait)).toBe(0);
  });

  it('B12: 특기 보유자가 2명 이상이면 인원수에 비례해 시너지 보너스가 붙고, 4개 유효 함수 모두에 반영된다', () => {
    const base: Staff = { coaching: 10, medical: 10, scouting: 10, youth: 10 };
    const twoTraits: Staff = {
      ...base,
      members: {
        coaching: { name: 'A', age: 40, contractYears: 2, trait: 'developmentGuru' },
        medical: { name: 'B', age: 40, contractYears: 2, trait: 'rehabSpecialist' },
      },
    };
    const threeTraits: Staff = {
      ...base,
      members: {
        ...twoTraits.members,
        scouting: { name: 'C', age: 40, contractYears: 2, trait: 'eyeForTalent' },
      },
    };
    const fourTraits: Staff = {
      ...base,
      members: {
        ...threeTraits.members,
        youth: { name: 'D', age: 40, contractYears: 2, trait: 'academyMaestro' },
      },
    };
    expect(staffTraitSynergyBonus(twoTraits)).toBeGreaterThan(0);
    expect(staffTraitSynergyBonus(threeTraits)).toBeGreaterThan(staffTraitSynergyBonus(twoTraits));
    expect(staffTraitSynergyBonus(fourTraits)).toBeGreaterThan(staffTraitSynergyBonus(threeTraits));

    const synergy = staffTraitSynergyBonus(twoTraits);
    expect(effectiveCoaching('MC', twoTraits)).toBe(effectiveCoaching('MC', base) + STAFF_TRAIT_BONUS + synergy);
    expect(effectiveMedical(twoTraits)).toBe(effectiveMedical(base) + STAFF_TRAIT_BONUS + synergy);
    expect(effectiveScouting(twoTraits)).toBe(effectiveScouting(base) + synergy);
    expect(effectiveYouth(twoTraits)).toBe(effectiveYouth(base) + synergy);
  });

  it('B12: 전담 리저브 코치를 도입한 경우에도 시너지 보너스가 동일하게 반영된다', () => {
    const withoutReserveCoach: Staff = {
      coaching: 10, medical: 10, scouting: 10, youth: 10,
      members: {
        coaching: { name: 'A', age: 40, contractYears: 2, trait: 'developmentGuru' },
        medical: { name: 'B', age: 40, contractYears: 2, trait: 'rehabSpecialist' },
      },
    };
    const withReserveCoach: Staff = { ...withoutReserveCoach, reserveCoach: 15 };
    const synergy = staffTraitSynergyBonus(withoutReserveCoach);
    expect(synergy).toBeGreaterThan(0);
    // reserveCoach 미도입 시(폴백) 시너지 포함 effectiveCoaching과 정확히 같다.
    expect(effectiveReserveCoaching('ST', withoutReserveCoach)).toBe(effectiveCoaching('ST', withoutReserveCoach));
    // reserveCoach 도입 시에도 시너지가 그대로 더해진다.
    const posLevel = 10; // 세부 코치 미도입 → 총괄 coaching 레벨로 대체
    expect(effectiveReserveCoaching('ST', withReserveCoach))
      .toBeCloseTo(posLevel * 0.3 + 15 * 0.7 + synergy, 6);
  });

  it('재활 전문가 의료진이 있으면 같은 조건에서 경기 중 부상이 더 적다(다수 시드 누적)', () => {
    function injuriesWith(staff: Staff): number {
      const rng = new Rng(3);
      const club = generateClub(rng, 'c', 'C', 12);
      club.staff = staff;
      const opp = generateClub(rng, 'o', 'O', 12);
      const t = defaultTactic(club); const ot = defaultTactic(opp);
      let injuries = 0;
      for (let i = 0; i < 150; i++) {
        const result = simulateMatch({ home: { club, tactic: t }, away: { club: opp, tactic: ot }, seed: 2000 + i });
        injuries += result.injuries.filter((e) => e.side === 'home').length;
      }
      return injuries;
    }
    const base: Staff = { coaching: 10, medical: 10, scouting: 10, youth: 10 };
    const withTrait: Staff = { ...base, members: { medical: { name: 'G', age: 40, contractYears: 2, trait: 'rehabSpecialist' } } };
    expect(injuriesWith(withTrait)).toBeLessThanOrEqual(injuriesWith(base));
  });

  it('스태프 업그레이드로 새 인물을 영입하면 특기가 다시 판정된다(레벨이 바뀌면 다른 인물)', () => {
    const rng = new Rng(9);
    const club = generateClub(rng, 'c', 'C', 12);
    club.staff.coaching = 10;
    club.staff.members = hireInitialStaffMembers(club.id, club.staff);
    club.finance.balance = 10_000_000_000;
    const before = club.staff.members.coaching;
    upgradeStaff(club, 'coaching');
    const after = club.staff.members!.coaching;
    expect(after?.name).not.toBe(before?.name);
  });
});

describe('고도화 Item9: 스태프 특성 등급제', () => {
  it('초급 등급은 STAFF_TRAIT_BONUS보다 작고, 전설급은 더 큰 보너스를 준다', () => {
    const base: Staff = { coaching: 10, medical: 10, scouting: 10, youth: 10 };
    const novice: Staff = {
      ...base, members: { coaching: { name: 'A', age: 40, contractYears: 2, trait: 'developmentGuru', traitTier: 'novice' } },
    };
    const legend: Staff = {
      ...base, members: { coaching: { name: 'B', age: 40, contractYears: 2, trait: 'developmentGuru', traitTier: 'legend' } },
    };
    expect(effectiveCoaching('MC', novice)).toBeLessThan(effectiveCoaching('MC', base) + STAFF_TRAIT_BONUS);
    expect(effectiveCoaching('MC', legend)).toBeGreaterThan(effectiveCoaching('MC', base) + STAFF_TRAIT_BONUS);
  });

  it('traitTier가 없으면(구버전 세이브) veteran 등급과 동일하게 STAFF_TRAIT_BONUS를 적용한다', () => {
    const base: Staff = { coaching: 10, medical: 10, scouting: 10, youth: 10 };
    const legacy: Staff = {
      ...base, members: { medical: { name: 'C', age: 40, contractYears: 2, trait: 'rehabSpecialist' } },
    };
    const veteran: Staff = {
      ...base, members: { medical: { name: 'D', age: 40, contractYears: 2, trait: 'rehabSpecialist', traitTier: 'veteran' } },
    };
    expect(effectiveMedical(legacy)).toBe(effectiveMedical(veteran));
    expect(effectiveMedical(legacy)).toBe(effectiveMedical(base) + STAFF_TRAIT_BONUS);
  });

  it('같은 구단id·직책·레벨 조합이면 등급 판정도 항상 같다(결정론적)', () => {
    const a = hireInitialStaffMembers('club-tier', { coaching: 14, medical: 14, scouting: 14, youth: 14 } as Staff);
    const b = hireInitialStaffMembers('club-tier', { coaching: 14, medical: 14, scouting: 14, youth: 14 } as Staff);
    expect(a.coaching?.traitTier).toBe(b.coaching?.traitTier);
    expect(a.medical?.traitTier).toBe(b.medical?.traitTier);
  });

  it('충분히 많은 조합을 뽑으면 초급·중급·전설급 세 등급이 모두 나온다', () => {
    const tiers = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const members = hireInitialStaffMembers(`club-tier-${i}`, {
        coaching: 5 + (i % 15), medical: 5 + (i % 15), scouting: 5 + (i % 15), youth: 5 + (i % 15),
      } as Staff);
      for (const kind of ['coaching', 'medical', 'scouting', 'youth'] as const) {
        const tier = members[kind]?.traitTier;
        if (tier) tiers.add(tier);
      }
    }
    expect(tiers.has('novice')).toBe(true);
    expect(tiers.has('veteran')).toBe(true);
    expect(tiers.has('legend')).toBe(true);
  });
});
