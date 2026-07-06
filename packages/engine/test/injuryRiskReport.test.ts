import { describe, it, expect } from 'vitest';
import {
  predictedInjuryRiskPerMatch, buildInjuryRiskReport, injuryRiskTier,
} from '../src/injury.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function makeClub(seed = 1, tier = 12) {
  return generateClub(new Rng(seed), 'c', 'C', tier);
}

describe('신규 개선 항목 20: 의료진 부상 예측 리포트', () => {
  it('의료 레벨이 높을수록 예측 부상 확률이 낮아진다', () => {
    const club = makeClub();
    const p = club.players[0]!;
    const lowMedical = predictedInjuryRiskPerMatch(p, 5);
    const highMedical = predictedInjuryRiskPerMatch(p, 18);
    expect(highMedical).toBeLessThan(lowMedical);
  });

  it('부상 잦음(injuryProne) 특성 보유 선수는 예측 확률이 더 높다', () => {
    const club = makeClub();
    const p = club.players[0]!;
    p.traits = [];
    const base = predictedInjuryRiskPerMatch(p, 10);
    p.traits = ['injuryProne'];
    const withTrait = predictedInjuryRiskPerMatch(p, 10);
    expect(withTrait).toBeGreaterThan(base);
  });

  it('강철 체력(ironMan) 특성 보유 선수는 예측 확률이 더 낮다', () => {
    const club = makeClub();
    const p = club.players[0]!;
    p.traits = [];
    const base = predictedInjuryRiskPerMatch(p, 10);
    p.traits = ['ironMan'];
    const withTrait = predictedInjuryRiskPerMatch(p, 10);
    expect(withTrait).toBeLessThan(base);
  });

  it('부상방지(conditioning) 훈련 포커스는 예측 확률을 낮춘다', () => {
    const club = makeClub();
    const p = club.players[0]!;
    p.trainingFocus = 'technical';
    const base = predictedInjuryRiskPerMatch(p, 10);
    p.trainingFocus = 'conditioning';
    const withFocus = predictedInjuryRiskPerMatch(p, 10);
    expect(withFocus).toBeLessThan(base);
  });

  it('재부상 위험 구간에 있으면(복귀 직후) 예측 확률이 일시적으로 더 높다', () => {
    const club = makeClub();
    const p = club.players[0]!;
    p.reinjuryRiskMatches = undefined;
    const base = predictedInjuryRiskPerMatch(p, 10);
    p.reinjuryRiskMatches = 5;
    const inWindow = predictedInjuryRiskPerMatch(p, 10);
    expect(inWindow).toBeGreaterThan(base);
  });

  it('injuryRiskTier는 확률 구간에 따라 낮음/보통/높음/매우 높음을 반환한다', () => {
    expect(injuryRiskTier(0.01)).toBe('low');
    expect(injuryRiskTier(0.07)).toBe('medium');
    expect(injuryRiskTier(0.12)).toBe('high');
    expect(injuryRiskTier(0.2)).toBe('veryHigh');
  });

  it('buildInjuryRiskReport는 부상·정지 중인 선수를 제외하고 위험도 내림차순으로 정렬한다', () => {
    const club = makeClub();
    club.players[0]!.injuryMatches = 3;
    club.players[1]!.suspensionMatches = 2;
    const report = buildInjuryRiskReport(club);
    expect(report.some((r) => r.playerId === club.players[0]!.id)).toBe(false);
    expect(report.some((r) => r.playerId === club.players[1]!.id)).toBe(false);
    for (let i = 1; i < report.length; i++) {
      expect(report[i - 1]!.riskPerMatch).toBeGreaterThanOrEqual(report[i]!.riskPerMatch);
    }
  });

  it('buildInjuryRiskReport 결과는 injuryProne/ironMan/훈련 포커스/재부상 구간 정보를 포함한다', () => {
    const club = makeClub();
    club.players[0]!.traits = ['injuryProne'];
    club.players[0]!.reinjuryRiskMatches = 3;
    const report = buildInjuryRiskReport(club);
    const entry = report.find((r) => r.playerId === club.players[0]!.id)!;
    expect(entry.isInjuryProne).toBe(true);
    expect(entry.isIronMan).toBe(false);
    expect(entry.reinjuryWindowRemaining).toBe(3);
  });
});
