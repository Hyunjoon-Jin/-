import { describe, it, expect } from 'vitest';
import {
  attendanceFormFactor, settleSeason, generateSponsorGoal, evaluateSponsorGoal, SPONSOR_GOAL_LABEL,
  sponsorStreakMultiplier,
} from '../src/finance.js';
import { confidenceDelta } from '../src/board.js';
import { generateDemand } from '../src/demands.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { BoardPersona } from '../src/types.js';

/**
 * Phase 8 — 재정·이사회·미디어 심화 (C01/C02/C03) 회귀 테스트.
 */

describe('C01: 관중·폼 연동 매치데이 수익', () => {
  it('폼 정보가 없으면(하위 호환) 보정 없이 1.0을 반환한다', () => {
    expect(attendanceFormFactor(undefined)).toBe(1);
  });

  it('폼 비율이 낮을수록 계수가 낮고, 높을수록 계수가 높다(0.7~1.3 범위)', () => {
    expect(attendanceFormFactor(0)).toBeCloseTo(0.7, 6);
    expect(attendanceFormFactor(1)).toBeCloseTo(1.3, 6);
    expect(attendanceFormFactor(0.5)).toBeCloseTo(1.0, 6);
  });

  it('settleSeason은 같은 순위·평판이라도 폼이 좋을수록 매치데이 수익이 크다', () => {
    const clubGood = generateClub(new Rng(1), 'g', 'Good', 12);
    const clubBad = generateClub(new Rng(1), 'b', 'Bad', 12);
    const reportGood = settleSeason(clubGood, 5, 20, 19, 1); // 전승
    const reportBad = settleSeason(clubBad, 5, 20, 19, 0);   // 전패
    expect(reportGood.income.matchday).toBeGreaterThan(reportBad.income.matchday);
  });

  it('recentFormRatio를 생략하면 이전과 동일한(보정 없는) 결과를 낸다', () => {
    const club = generateClub(new Rng(4), 'c', 'C', 12);
    const clubCopy = generateClub(new Rng(4), 'c', 'C', 12);
    const withoutRatio = settleSeason(club, 3, 20, 19);
    const withNeutralRatio = settleSeason(clubCopy, 3, 20, 19, undefined);
    expect(withoutRatio.income.matchday).toBe(withNeutralRatio.income.matchday);
  });
});

describe('C02: 스폰서 보너스 목표', () => {
  it('생성 확률에 따라 목표가 있을 수도, 없을 수도 있다', () => {
    let some = 0; let none = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const goal = generateSponsorGoal(new Rng(seed), 12);
      if (goal) some++; else none++;
    }
    expect(some).toBeGreaterThan(0);
    expect(none).toBeGreaterThan(0);
  });

  it('평판이 높을수록 보너스 금액이 크다', () => {
    // 목표가 나올 때까지 시드를 바꿔가며 비교(둘 다 목표가 생성된 케이스만 비교).
    let lowBonus: number | undefined; let highBonus: number | undefined;
    for (let seed = 1; seed <= 50 && (lowBonus === undefined || highBonus === undefined); seed++) {
      const low = generateSponsorGoal(new Rng(seed), 3);
      const high = generateSponsorGoal(new Rng(seed), 18);
      if (low && lowBonus === undefined) lowBonus = low.bonus;
      if (high && highBonus === undefined) highBonus = high.bonus;
    }
    expect(highBonus!).toBeGreaterThan(lowBonus!);
  });

  it('evaluateSponsorGoal은 목표 종류에 맞는 결과 필드만 확인한다', () => {
    const topGoal = { kind: 'top4Finish' as const, bonus: 1000 };
    expect(evaluateSponsorGoal(topGoal, { top4Finish: true, cupWon: false })).toBe(true);
    expect(evaluateSponsorGoal(topGoal, { top4Finish: false, cupWon: true })).toBe(false);
    const cupGoal = { kind: 'cupWon' as const, bonus: 1000 };
    expect(evaluateSponsorGoal(cupGoal, { top4Finish: false, cupWon: true })).toBe(true);
  });

  it('모든 목표 종류에 라벨이 있다', () => {
    expect(SPONSOR_GOAL_LABEL.top4Finish.length).toBeGreaterThan(0);
    expect(SPONSOR_GOAL_LABEL.cupWon.length).toBeGreaterThan(0);
  });
});

describe('C-new2: 스폰서 목표 연속 달성 스트릭', () => {
  it('스트릭 0(첫 달성)은 배율 1.0이다', () => {
    expect(sponsorStreakMultiplier(0)).toBe(1);
  });

  it('스트릭이 쌓일수록 배율이 커진다', () => {
    expect(sponsorStreakMultiplier(1)).toBeGreaterThan(sponsorStreakMultiplier(0));
    expect(sponsorStreakMultiplier(3)).toBeGreaterThan(sponsorStreakMultiplier(1));
  });

  it('상한 이상으로는 배율이 더 늘지 않는다(무한 인플레이션 방지)', () => {
    expect(sponsorStreakMultiplier(5)).toBe(sponsorStreakMultiplier(100));
  });
});

describe('C03: 회장 성향 유형', () => {
  const baseInput = { position: 15, objective: 9, promoted: false, relegated: false, netFinance: -100 };

  it('성향을 생략하면(하위 호환) 기존과 동일하게 동작한다', () => {
    const withoutPersona = confidenceDelta(baseInput);
    const neutralPersona: BoardPersona | undefined = undefined;
    expect(confidenceDelta(baseInput, neutralPersona)).toBe(withoutPersona);
  });

  it('인내심 있는 보드는 목표 미달에 관대하고, 조급한 보드는 가혹하다', () => {
    const patient = confidenceDelta(baseInput, { patience: 'patient', style: 'conservative' });
    const impatient = confidenceDelta(baseInput, { patience: 'impatient', style: 'conservative' });
    // 둘 다 목표 미달(음수)이므로, 인내심 있는 쪽이 덜 나쁘다(더 큰/0에 가까운 값).
    expect(patient).toBeGreaterThan(impatient);
  });

  it('목표 초과 달성 시에는 인내심 성향이 결과에 영향을 주지 않는다', () => {
    const overInput = { position: 3, objective: 9, promoted: false, relegated: false, netFinance: 0 };
    const patient = confidenceDelta(overInput, { patience: 'patient', style: 'conservative' });
    const impatient = confidenceDelta(overInput, { patience: 'impatient', style: 'conservative' });
    expect(patient).toBe(impatient);
  });

  it('보수적인 보드는 재정 결과에 더 민감하고, 공격적인 보드는 덜 민감하다', () => {
    const negFinanceInput = { position: 9, objective: 9, promoted: false, relegated: false, netFinance: -100 };
    const conservative = confidenceDelta(negFinanceInput, { patience: 'patient', style: 'conservative' });
    const aggressive = confidenceDelta(negFinanceInput, { patience: 'patient', style: 'aggressive' });
    // posDelta=0이라 순전히 재정 페널티 차이만 남는다 — 보수적인 쪽이 더 크게 깎인다.
    expect(conservative).toBeLessThan(aggressive);
  });

  it('공격적인 보드는 더 자주, 더 강하게 특별 요구를 낸다(다수 시드 누적 비교)', () => {
    let aggressiveCount = 0; let conservativeCount = 0;
    let aggressiveMagnitude = 0; let conservativeMagnitude = 0;
    const trials = 200;
    for (let seed = 1; seed <= trials; seed++) {
      const a = generateDemand({ overWages: false }, new Rng(seed), 'aggressive');
      const c = generateDemand({ overWages: false }, new Rng(seed), 'conservative');
      if (a) { aggressiveCount++; aggressiveMagnitude += a.reward + a.penalty; }
      if (c) { conservativeCount++; conservativeMagnitude += c.reward + c.penalty; }
    }
    expect(aggressiveCount).toBeGreaterThan(conservativeCount);
    expect(aggressiveMagnitude / Math.max(1, aggressiveCount))
      .toBeGreaterThan(conservativeMagnitude / Math.max(1, conservativeCount));
  });

  it('구단 생성 시 이사회 성향이 결정론적으로 배정된다(같은 시드는 같은 성향)', () => {
    const a = generateClub(new Rng(77), 'x', 'X', 10);
    const b = generateClub(new Rng(77), 'x', 'X', 10);
    expect(a.boardPersona).toEqual(b.boardPersona);
    expect(['patient', 'impatient']).toContain(a.boardPersona!.patience);
    expect(['conservative', 'aggressive']).toContain(a.boardPersona!.style);
  });
});
