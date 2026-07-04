import { describe, it, expect } from 'vitest';
import {
  effectiveCoaching, specialistCoachLevel, upgradeStaff,
  hireInitialStaffMembers, tickStaffContracts, NAMED_STAFF_KINDS,
} from '../src/staffActions.js';
import { academyNationPool } from '../src/scouting.js';
import { generateClub, generateAcademyIntake } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Staff } from '../src/types.js';

/**
 * Phase 7 — 스태프·육성 심화 (B01/B03/B07) 회귀 테스트.
 */

function baseStaff(coaching: number): Staff {
  return { coaching, medical: 10, scouting: 10, youth: 10 };
}

describe('B01: 세부 코치 레벨 → effectiveCoaching', () => {
  it('세부 코치가 전혀 도입되지 않으면(구버전 세이브) 결과가 정확히 staff.coaching과 같다', () => {
    const staff = baseStaff(14);
    expect(effectiveCoaching('GK', staff)).toBe(14);
    expect(effectiveCoaching('ST', staff)).toBe(14);
    expect(effectiveCoaching('DC', staff)).toBe(14);
    expect(effectiveCoaching('MC', staff)).toBe(14);
  });

  it('GK 포지션은 coachGk 레벨만 반영한다(공격/수비 코치와 무관)', () => {
    const staff: Staff = { ...baseStaff(10), coachGk: 20, coachAttack: 1, coachDefense: 1, coachPhysical: 10 };
    // GK 포지션 성장에는 coachGk(20)*0.7 + coachPhysical(10)*0.3 = 17
    expect(effectiveCoaching('GK', staff)).toBeCloseTo(20 * 0.7 + 10 * 0.3, 6);
  });

  it('공격수는 coachAttack, 수비수는 coachDefense가 지배적으로 반영된다', () => {
    const staff: Staff = { ...baseStaff(10), coachAttack: 20, coachDefense: 1, coachPhysical: 10 };
    const attackerLevel = effectiveCoaching('ST', staff);
    const defenderLevel = effectiveCoaching('DC', staff);
    expect(attackerLevel).toBeGreaterThan(defenderLevel);
  });

  it('미드필더는 공격·수비 코치의 평균을 받는다', () => {
    const staff: Staff = { ...baseStaff(10), coachAttack: 20, coachDefense: 10, coachPhysical: 10 };
    const midLevel = effectiveCoaching('MC', staff);
    const expectedPos = (20 + 10) / 2;
    expect(midLevel).toBeCloseTo(expectedPos * 0.7 + 10 * 0.3, 6);
  });

  it('specialistCoachLevel은 미도입 시 총괄 coaching으로 대체한다', () => {
    const staff = baseStaff(8);
    expect(specialistCoachLevel(staff, 'coachGk')).toBe(8);
    expect(specialistCoachLevel({ ...staff, coachGk: 15 }, 'coachGk')).toBe(15);
  });
});

describe('B03: 실명 스태프', () => {
  it('구단 생성 시 4대 스태프(coaching/medical/scouting/youth)에 이름·나이·계약이 배정된다', () => {
    const club = generateClub(new Rng(42), 'c1', 'Club', 12);
    expect(club.staff.members).toBeDefined();
    for (const kind of NAMED_STAFF_KINDS) {
      const m = club.staff.members![kind];
      expect(m).toBeDefined();
      expect(m!.name.length).toBeGreaterThan(0);
      expect(m!.age).toBeGreaterThanOrEqual(32);
      expect(m!.contractYears).toBeGreaterThanOrEqual(1);
    }
  });

  it('같은 구단ID·직책·레벨 조합이면 항상 같은 인물이 결정론적으로 나온다', () => {
    const staff = baseStaff(10);
    const a = hireInitialStaffMembers('same-club', staff);
    const b = hireInitialStaffMembers('same-club', staff);
    expect(a.coaching).toEqual(b.coaching);
  });

  it('실명 직책(coaching)을 업그레이드하면 새 인물(이름/계약)로 교체된다', () => {
    const club = generateClub(new Rng(3), 'c2', 'Club', 10);
    club.finance.balance = 999_999_999;
    const before = club.staff.members!.coaching!;
    const r = upgradeStaff(club, 'coaching');
    expect(r.ok).toBe(true);
    const after = club.staff.members!.coaching!;
    // 레벨이 바뀌었으므로 시드가 달라져 이름이 이전과 달라질 가능성이 매우 높다(해시 기반).
    expect(after).not.toEqual(before);
    expect(after.name.length).toBeGreaterThan(0);
  });

  it('세부 코치(coachGk 등) 업그레이드는 실명 인물을 만들지 않는다(총괄 코치 산하로 취급)', () => {
    const club = generateClub(new Rng(11), 'c3', 'Club', 10);
    club.finance.balance = 999_999_999;
    club.staff.coachGk = 5;
    const membersBefore = JSON.stringify(club.staff.members);
    const r = upgradeStaff(club, 'coachGk');
    expect(r.ok).toBe(true);
    expect(club.staff.coachGk).toBe(6);
    expect(JSON.stringify(club.staff.members)).toBe(membersBefore);
  });

  it('tickStaffContracts는 잔여 계약을 1년 줄이고, 0 이하가 되면 조용히 재계약한다', () => {
    const club = generateClub(new Rng(21), 'c4', 'Club', 10);
    const m = club.staff.members!.medical!;
    m.contractYears = 1;
    tickStaffContracts(club);
    expect(club.staff.members!.medical!.contractYears).toBeGreaterThanOrEqual(1); // 0으로 갔다가 즉시 재계약
  });

  it('members가 없는(구버전 세이브) 구단에서도 tickStaffContracts는 안전하게 아무 일도 하지 않는다', () => {
    const club = generateClub(new Rng(22), 'c5', 'Club', 10);
    club.staff.members = undefined;
    expect(() => tickStaffContracts(club)).not.toThrow();
  });
});

describe('B07: 아카데미 스카우팅 네트워크', () => {
  it('스카우팅 레벨이 낮으면 소수 핵심 국가로만 국적 풀이 제한된다', () => {
    const lowPool = academyNationPool(0);
    const midPool = academyNationPool(10);
    const highPool = academyNationPool(20);
    expect(lowPool.length).toBeLessThan(midPool.length);
    expect(midPool.length).toBeLessThan(highPool.length);
    // 저레벨 풀은 항상 고레벨 풀의 부분집합(누적 확장)이다.
    for (const n of lowPool) expect(highPool).toContain(n);
    for (const n of midPool) expect(highPool).toContain(n);
  });

  it('아카데미 배출 선수의 국적은 해당 스카우팅 레벨의 풀 안에서만 나온다', () => {
    const pool = academyNationPool(3);
    for (let seed = 1; seed <= 20; seed++) {
      const intake = generateAcademyIntake(new Rng(seed), 12, 20, 3);
      for (const p of intake) expect(pool).toContain(p.nationality);
    }
  });

  it('scoutingLevel을 생략하면 기본값(20=전체 개방)으로 동작해 기존 호출부와 하위 호환된다', () => {
    const withDefault = generateAcademyIntake(new Rng(9), 12, 20);
    const fullPool = academyNationPool(20);
    for (const p of withDefault) expect(fullPool).toContain(p.nationality);
  });
});
