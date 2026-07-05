import { describe, it, expect } from 'vitest';
import {
  academyPotentialBonus, academyUpgradeCost, upgradeAcademy, ACADEMY_MAX,
} from '../src/finance.js';
import { generateClub, generateAcademyIntake } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function makeClub(seed = 1, tier = 12) {
  const rng = new Rng(seed);
  return generateClub(rng, 'c', 'C', tier);
}

describe('B11: 아카데미 시설 등급', () => {
  it('레벨이 없으면(0) 보너스는 0, 레벨이 오를수록 보너스가 커진다', () => {
    expect(academyPotentialBonus()).toBe(0);
    expect(academyPotentialBonus(0)).toBe(0);
    expect(academyPotentialBonus(5)).toBeGreaterThan(academyPotentialBonus(2));
    expect(academyPotentialBonus(ACADEMY_MAX)).toBeGreaterThan(0);
  });

  it('범위를 벗어난 레벨은 클램프된다', () => {
    expect(academyPotentialBonus(-5)).toBe(0);
    expect(academyPotentialBonus(ACADEMY_MAX + 10)).toBe(academyPotentialBonus(ACADEMY_MAX));
  });

  it('증축 비용은 레벨이 오를수록 가파르게 증가한다', () => {
    const c1 = academyUpgradeCost(0);
    const c2 = academyUpgradeCost(1);
    const c3 = academyUpgradeCost(2);
    expect(c2).toBeGreaterThan(c1);
    expect(c3 - c2).toBeGreaterThan(c2 - c1);
  });

  it('자금이 충분하면 증축되고 비용이 차감된다', () => {
    const club = makeClub(1);
    club.finance.balance = 10_000_000;
    club.finance.academyLevel = 3;
    const before = club.finance.balance;
    const cost = academyUpgradeCost(3);
    const r = upgradeAcademy(club);
    expect(r.ok).toBe(true);
    expect(r.newLevel).toBe(4);
    expect(club.finance.academyLevel).toBe(4);
    expect(club.finance.balance).toBe(before - cost);
  });

  it('자금이 부족하면 증축이 거절되고 상태가 변하지 않는다', () => {
    const club = makeClub(2);
    club.finance.balance = 0;
    club.finance.academyLevel = 0;
    const r = upgradeAcademy(club);
    expect(r.ok).toBe(false);
    expect(club.finance.academyLevel).toBe(0);
  });

  it('최대 레벨에서는 더 증축할 수 없다', () => {
    const club = makeClub(3);
    club.finance.balance = 999_999_999;
    club.finance.academyLevel = ACADEMY_MAX;
    const r = upgradeAcademy(club);
    expect(r.ok).toBe(false);
    expect(club.finance.academyLevel).toBe(ACADEMY_MAX);
  });

  it('academyLevel을 생략하면(0) 인테이크 결과가 기존과 정확히 동일하다(하위 호환)', () => {
    const a = generateAcademyIntake(new Rng(10), 12, 14, 20);
    const b = generateAcademyIntake(new Rng(10), 12, 14, 20, 0);
    expect(a).toEqual(b);
  });

  it('시설 등급이 높을수록 같은 유스 레벨에서도 인테이크 잠재력이 더 높다', () => {
    const low = generateAcademyIntake(new Rng(20), 12, 14, 20, 0);
    const high = generateAcademyIntake(new Rng(20), 12, 14, 20, ACADEMY_MAX);
    const avgPotential = (arr: { potential: number }[]) => arr.reduce((s, p) => s + p.potential, 0) / arr.length;
    expect(avgPotential(high)).toBeGreaterThan(avgPotential(low));
  });
});
