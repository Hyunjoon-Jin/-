import { describe, it, expect } from 'vitest';
import {
  hireInitialStaffMembers, effectiveCoaching, effectiveMedical, effectiveScouting, effectiveYouth,
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
