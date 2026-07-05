import { describe, it, expect } from 'vitest';
import {
  trainingGroundInjuryFactor, trainingGroundUpgradeCost, upgradeTrainingGround, TRAINING_GROUND_MAX,
} from '../src/finance.js';
import { predictedInjuryRiskPerMatch, buildInjuryRiskReport } from '../src/injury.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { simulateMatch } from '../src/simulateMatch.js';
import { Rng } from '../src/rng.js';

function makeClub(seed = 1, tier = 12) {
  const rng = new Rng(seed);
  return generateClub(rng, 'c', 'C', tier);
}

describe('신규 개선 항목 21: 훈련장(피지컬 트레이닝) 시설', () => {
  it('레벨이 없으면(0) 배율은 1.0, 레벨이 오를수록 배율이 작아진다(부상 확률 감소)', () => {
    expect(trainingGroundInjuryFactor()).toBe(1);
    expect(trainingGroundInjuryFactor(0)).toBe(1);
    expect(trainingGroundInjuryFactor(5)).toBeLessThan(trainingGroundInjuryFactor(2));
    expect(trainingGroundInjuryFactor(TRAINING_GROUND_MAX)).toBeCloseTo(0.8, 5);
  });

  it('범위를 벗어난 레벨은 클램프된다', () => {
    expect(trainingGroundInjuryFactor(-5)).toBe(1);
    expect(trainingGroundInjuryFactor(TRAINING_GROUND_MAX + 10)).toBeCloseTo(trainingGroundInjuryFactor(TRAINING_GROUND_MAX), 5);
  });

  it('증축 비용은 레벨이 오를수록 가파르게 증가한다', () => {
    const c1 = trainingGroundUpgradeCost(0);
    const c2 = trainingGroundUpgradeCost(1);
    const c3 = trainingGroundUpgradeCost(2);
    expect(c2).toBeGreaterThan(c1);
    expect(c3 - c2).toBeGreaterThan(c2 - c1);
  });

  it('자금이 충분하면 증축되고 비용이 차감된다', () => {
    const club = makeClub(1);
    club.finance.balance = 10_000_000;
    club.finance.trainingGroundLevel = 3;
    const before = club.finance.balance;
    const cost = trainingGroundUpgradeCost(3);
    const r = upgradeTrainingGround(club);
    expect(r.ok).toBe(true);
    expect(r.newLevel).toBe(4);
    expect(club.finance.trainingGroundLevel).toBe(4);
    expect(club.finance.balance).toBe(before - cost);
  });

  it('자금이 부족하면 증축이 거절되고 상태가 변하지 않는다', () => {
    const club = makeClub(2);
    club.finance.balance = 0;
    club.finance.trainingGroundLevel = 0;
    const r = upgradeTrainingGround(club);
    expect(r.ok).toBe(false);
    expect(club.finance.trainingGroundLevel).toBe(0);
  });

  it('최대 레벨에서는 더 증축할 수 없다', () => {
    const club = makeClub(3);
    club.finance.balance = 999_999_999;
    club.finance.trainingGroundLevel = TRAINING_GROUND_MAX;
    const r = upgradeTrainingGround(club);
    expect(r.ok).toBe(false);
    expect(club.finance.trainingGroundLevel).toBe(TRAINING_GROUND_MAX);
  });

  it('부상 예측 리포트(신규 개선 항목 20)에도 훈련장 시설 등급이 반영된다', () => {
    const club = makeClub(9);
    const p = club.players[0]!;
    const withoutFacility = predictedInjuryRiskPerMatch(p, 10, 0);
    const withFacility = predictedInjuryRiskPerMatch(p, 10, TRAINING_GROUND_MAX);
    expect(withFacility).toBeLessThan(withoutFacility);

    club.finance.trainingGroundLevel = 0;
    const reportLow = buildInjuryRiskReport(club).find((r) => r.playerId === p.id)!;
    club.finance.trainingGroundLevel = TRAINING_GROUND_MAX;
    const reportHigh = buildInjuryRiskReport(club).find((r) => r.playerId === p.id)!;
    expect(reportHigh.riskPerMatch).toBeLessThan(reportLow.riskPerMatch);
  });

  it('실제 경기 시뮬레이션에서도 훈련장 시설이 높을수록 부상 발생이 줄어든다(다수 시드 누적 비교)', () => {
    const TRIALS = 200;
    let lowInjuries = 0;
    let highInjuries = 0;
    for (let seed = 1; seed <= TRIALS; seed++) {
      const away = generateClub(new Rng(seed + 500), 'opp', 'Opp', 12);
      const awayTactic = defaultTactic(away);

      const lowClub = generateClub(new Rng(seed), 'lowClub', 'Low', 12);
      lowClub.finance.trainingGroundLevel = 0;
      const lowResult = simulateMatch({
        home: { club: lowClub, tactic: defaultTactic(lowClub) },
        away: { club: away, tactic: awayTactic },
        seed,
      });
      lowInjuries += lowResult.injuries.filter((e) => e.side === 'home').length;

      const highClub = generateClub(new Rng(seed), 'highClub', 'High', 12);
      highClub.finance.trainingGroundLevel = TRAINING_GROUND_MAX;
      const highResult = simulateMatch({
        home: { club: highClub, tactic: defaultTactic(highClub) },
        away: { club: away, tactic: awayTactic },
        seed,
      });
      highInjuries += highResult.injuries.filter((e) => e.side === 'home').length;
    }
    expect(lowInjuries).toBeGreaterThan(highInjuries);
  });
});
