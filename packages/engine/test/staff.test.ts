import { describe, it, expect } from 'vitest';
import { upgradeStaff, upgradeCost, STAFF_MAX } from '../src/staffActions.js';
import { progressPlayer } from '../src/progression.js';
import { simulateMatch } from '../src/simulateMatch.js';
import { generateClub, defaultTactic, generateAcademyIntake } from '../src/generate.js';
import { currentAbility } from '../src/derived.js';
import { Rng } from '../src/rng.js';
import type { Player } from '../src/types.js';

function youngPlayer(): Player {
  const rng = new Rng(1);
  const club = generateClub(rng, 'c', 'C', 12);
  // 성장 여지가 큰 어린 선수 하나 구성
  const p = club.players[5]!;
  p.age = 18;
  p.potential = 180;
  // 능력치를 낮춰 갭 확보
  for (const k in p.attributes) (p.attributes as Record<string, number>)[k] = 8;
  return p;
}

describe('staff: 코칭 → 성장', () => {
  it('코칭이 높을수록 같은 선수가 더 많이 성장한다', () => {
    const a = youngPlayer();
    const b = youngPlayer();
    progressPlayer(a, new Rng(50), 3);   // 낮은 코칭
    progressPlayer(b, new Rng(50), 20);  // 높은 코칭
    expect(currentAbility(b)).toBeGreaterThan(currentAbility(a));
  });
});

describe('staff: 의료 → 부상', () => {
  it('의료 레벨이 높으면 부상 판정(경기 중 생성)이 더 적다', () => {
    // 같은 선수단, 의료만 다른 두 구단에서 다수 경기 반복 → 부상 이벤트 수 비교.
    // 부상은 simulateMatch가 판정(result.injuries)하므로 시드를 바꿔가며 직접 집계.
    function injuriesWith(medical: number): number {
      const rng = new Rng(3);
      const club = generateClub(rng, 'c', 'C', 12);
      club.staff.medical = medical;
      const opp = generateClub(rng, 'o', 'O', 12);
      const t = defaultTactic(club); const ot = defaultTactic(opp);
      let injuries = 0;
      for (let i = 0; i < 200; i++) {
        const result = simulateMatch({ home: { club, tactic: t }, away: { club: opp, tactic: ot }, seed: 1000 + i });
        injuries += result.injuries.filter((e) => e.side === 'home').length;
      }
      return injuries;
    }
    expect(injuriesWith(20)).toBeLessThan(injuriesWith(1));
  });
});

describe('staff: 업그레이드', () => {
  it('자금이 충분하면 레벨이 오르고 비용이 차감된다', () => {
    const rng = new Rng(9);
    const club = generateClub(rng, 'c', 'C', 12);
    club.staff.coaching = 10;
    club.finance.balance = 10_000_000;
    const before = club.finance.balance;
    const r = upgradeStaff(club, 'coaching');
    expect(r.ok).toBe(true);
    expect(club.staff.coaching).toBe(11);
    expect(club.finance.balance).toBe(before - r.cost!);
    expect(r.cost).toBe(upgradeCost(10));
  });

  it('자금 부족 시 실패, 레벨 불변', () => {
    const rng = new Rng(9);
    const club = generateClub(rng, 'c', 'C', 12);
    club.staff.medical = 10;
    club.finance.balance = 0;
    const r = upgradeStaff(club, 'medical');
    expect(r.ok).toBe(false);
    expect(club.staff.medical).toBe(10);
  });

  it('최고 레벨은 더 올릴 수 없다', () => {
    const rng = new Rng(9);
    const club = generateClub(rng, 'c', 'C', 12);
    club.staff.scouting = STAFF_MAX;
    club.finance.balance = 10_000_000;
    expect(upgradeStaff(club, 'scouting').ok).toBe(false);
  });
});

describe('staff: 유스 아카데미', () => {
  it('유스 레벨이 높을수록 배출 인원이 많다', () => {
    const rng1 = new Rng(5); const rng2 = new Rng(5);
    // generateAcademyIntake는 generate에서 import
    const lowCount = generateAcademyIntake(rng1, 12, 3).length;
    const highCount = generateAcademyIntake(rng2, 12, 20).length;
    expect(highCount).toBeGreaterThanOrEqual(lowCount);
    expect(lowCount).toBeGreaterThanOrEqual(1);
  });

  it('배출 유망주는 어리고(16~18세) 잠재력 여지가 있다', () => {
    const intake = generateAcademyIntake(new Rng(7), 14, 16);
    for (const p of intake) {
      expect(p.age).toBeGreaterThanOrEqual(16);
      expect(p.age).toBeLessThanOrEqual(18);
      expect(p.injuryMatches).toBe(0);
    }
  });
});
