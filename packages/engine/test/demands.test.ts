import { describe, it, expect } from 'vitest';
import {
  generateDemand, evaluateDemand, demandConfidence, type BoardDemand,
} from '../src/demands.js';
import { Rng } from '../src/rng.js';

describe('demands: 이사회 특별 요구', () => {
  it('임금 초과 시 감축 요구(벌점 큼)', () => {
    const d = generateDemand({ overWages: true }, new Rng(1))!;
    expect(d.kind).toBe('cutWages');
    expect(d.penalty).toBeGreaterThan(0);
  });

  it('임금 건전 시 요구 없음 또는 도전 과제', () => {
    // 여러 시드에서 null과 도전 과제가 모두 나온다
    const kinds = new Set<string>();
    for (let s = 0; s < 40; s++) {
      const d = generateDemand({ overWages: false }, new Rng(s));
      kinds.add(d ? d.kind : 'none');
    }
    expect(kinds.has('none')).toBe(true);
    expect(kinds.has('winCup') || kinds.has('clubTopScorer') || kinds.has('topHalfFinish')).toBe(true);
  });

  it('평가: 종류별 조건을 정확히 반영', () => {
    const base = { wageUnderBudget: false, cupWon: false, clubTopScorer: false, topHalfFinish: false };
    const cut: BoardDemand = { kind: 'cutWages', reward: 8, penalty: 10 };
    expect(evaluateDemand(cut, { ...base, wageUnderBudget: true })).toBe(true);
    expect(evaluateDemand(cut, { ...base, cupWon: true, clubTopScorer: true })).toBe(false);

    const cup: BoardDemand = { kind: 'winCup', reward: 12, penalty: 4 };
    expect(evaluateDemand(cup, { ...base, cupWon: true })).toBe(true);
    expect(evaluateDemand(cup, { ...base, wageUnderBudget: true, clubTopScorer: true })).toBe(false);

    const top: BoardDemand = { kind: 'clubTopScorer', reward: 12, penalty: 4 };
    expect(evaluateDemand(top, { ...base, clubTopScorer: true })).toBe(true);

    const half: BoardDemand = { kind: 'topHalfFinish', reward: 12, penalty: 4 };
    expect(evaluateDemand(half, { ...base, topHalfFinish: true })).toBe(true);
    expect(evaluateDemand(half, base)).toBe(false);
  });

  it('신뢰도 변화: 달성 +reward, 실패 −penalty', () => {
    const d: BoardDemand = { kind: 'winCup', reward: 12, penalty: 4 };
    expect(demandConfidence(d, true)).toBe(12);
    expect(demandConfidence(d, false)).toBe(-4);
  });

  it('감독 계약 ambition이 높을수록 임금 초과 요구의 벌점이 커진다', () => {
    const base = generateDemand({ overWages: true }, new Rng(1))!;
    const ambitious = generateDemand({ overWages: true, ambition: 3 }, new Rng(1))!;
    expect(ambitious.kind).toBe('cutWages');
    expect(ambitious.penalty).toBeGreaterThan(base.penalty);
  });

  it('ambition이 높을수록 도전 과제의 보상·벌점이 함께 커진다', () => {
    for (let s = 0; s < 20; s++) {
      const base = generateDemand({ overWages: false }, new Rng(s));
      const ambitious = generateDemand({ overWages: false, ambition: 2 }, new Rng(s));
      if (base && ambitious) {
        expect(ambitious.reward).toBeGreaterThan(base.reward);
        expect(ambitious.penalty).toBeGreaterThan(base.penalty);
      }
    }
  });

  it('ambition이 높을수록 요구가 발생하지 않을(null) 확률이 낮아진다', () => {
    let noneAtZero = 0;
    let noneAtHigh = 0;
    const trials = 200;
    for (let s = 0; s < trials; s++) {
      if (!generateDemand({ overWages: false, ambition: 0 }, new Rng(s))) noneAtZero++;
      if (!generateDemand({ overWages: false, ambition: 3 }, new Rng(s))) noneAtHigh++;
    }
    expect(noneAtHigh).toBeLessThan(noneAtZero);
  });

  it('ambition이 아무리 커도 보상/벌점이 board.ts의 시즌 성적 변동 폭(±40/38)과 비슷한 규모로 상한이 걸린다', () => {
    // 장기 계약을 아주 많이 맺어 ambition이 극단적으로 커진 상황을 가정 —
    // 예전엔 여기 상한이 없어 요구 하나로 신뢰도가 100→0까지 급락할 수 있었다.
    const extreme = generateDemand({ overWages: false, ambition: 1000 }, new Rng(1));
    if (extreme) {
      expect(extreme.reward).toBeLessThanOrEqual(40);
      expect(extreme.penalty).toBeLessThanOrEqual(40);
    }
    const cutWages = generateDemand({ overWages: true, ambition: 1000 }, new Rng(1))!;
    expect(cutWages.penalty).toBeLessThanOrEqual(40);
  });

  it('ambition이 상한(10)을 넘으면 스킵 확률이 더 낮아지지 않는다(요구가 매번 나오지는 않음)', () => {
    let none = 0;
    const trials = 200;
    for (let s = 0; s < trials; s++) {
      if (!generateDemand({ overWages: false, ambition: 1000 }, new Rng(s))) none++;
    }
    expect(none).toBeGreaterThan(0); // 스킵 확률 하한(0.15)이 여전히 적용됨
  });
});
