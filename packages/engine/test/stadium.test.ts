import { describe, it, expect } from 'vitest';
import {
  settleSeason, stadiumMatchdayMultiplier, stadiumUpgradeCost, upgradeStadium, STADIUM_MAX,
} from '../src/finance.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function makeClub(seed = 1, tier = 12) {
  const rng = new Rng(seed);
  return generateClub(rng, 'c', 'C', tier);
}

describe('C8: 스타디움 증축', () => {
  it('레벨이 없으면(0) 배율은 1.0, 레벨이 오를수록 배율이 커진다', () => {
    expect(stadiumMatchdayMultiplier()).toBe(1);
    expect(stadiumMatchdayMultiplier(0)).toBe(1);
    expect(stadiumMatchdayMultiplier(5)).toBeGreaterThan(stadiumMatchdayMultiplier(2));
    expect(stadiumMatchdayMultiplier(STADIUM_MAX)).toBeCloseTo(1.5, 5);
  });

  it('범위를 벗어난 레벨은 클램프된다', () => {
    expect(stadiumMatchdayMultiplier(-5)).toBe(1);
    expect(stadiumMatchdayMultiplier(STADIUM_MAX + 10)).toBeCloseTo(stadiumMatchdayMultiplier(STADIUM_MAX), 5);
  });

  it('증축 비용은 레벨이 오를수록 가파르게 증가한다', () => {
    const c1 = stadiumUpgradeCost(0);
    const c2 = stadiumUpgradeCost(1);
    const c3 = stadiumUpgradeCost(2);
    expect(c2).toBeGreaterThan(c1);
    expect(c3 - c2).toBeGreaterThan(c2 - c1); // 가속 증가(제곱 곡선)
  });

  it('자금이 충분하면 증축되고 비용이 차감된다', () => {
    const club = makeClub(1);
    club.finance.balance = 10_000_000;
    club.finance.stadiumLevel = 3;
    const before = club.finance.balance;
    const cost = stadiumUpgradeCost(3);
    const r = upgradeStadium(club);
    expect(r.ok).toBe(true);
    expect(r.newLevel).toBe(4);
    expect(club.finance.stadiumLevel).toBe(4);
    expect(club.finance.balance).toBe(before - cost);
  });

  it('자금이 부족하면 증축이 거절되고 상태가 변하지 않는다', () => {
    const club = makeClub(2);
    club.finance.balance = 0;
    club.finance.stadiumLevel = 0;
    const r = upgradeStadium(club);
    expect(r.ok).toBe(false);
    expect(club.finance.stadiumLevel).toBe(0);
  });

  it('최대 레벨에서는 더 증축할 수 없다', () => {
    const club = makeClub(3);
    club.finance.balance = 999_999_999;
    club.finance.stadiumLevel = STADIUM_MAX;
    const r = upgradeStadium(club);
    expect(r.ok).toBe(false);
    expect(club.finance.stadiumLevel).toBe(STADIUM_MAX);
  });

  it('스타디움 레벨이 높을수록 같은 조건에서 매치데이 수익(및 총수입)이 더 높다', () => {
    const clubLow = makeClub(4);
    const clubHigh = makeClub(4);
    clubLow.finance.stadiumLevel = 0;
    clubHigh.finance.stadiumLevel = STADIUM_MAX;
    const repLow = settleSeason(clubLow, 5, 12);
    const repHigh = settleSeason(clubHigh, 5, 12);
    expect(repHigh.income.matchday).toBeGreaterThan(repLow.income.matchday);
    expect(repHigh.income.total).toBeGreaterThan(repLow.income.total);
  });

  it('스타디움 레벨이 없는(구버전) 구단도 정상적으로 정산된다(하위 호환)', () => {
    const club = makeClub(5);
    delete club.finance.stadiumLevel;
    expect(() => settleSeason(club, 3, 12)).not.toThrow();
  });
});
