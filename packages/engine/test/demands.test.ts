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
    expect(kinds.has('winCup') || kinds.has('clubTopScorer')).toBe(true);
  });

  it('평가: 종류별 조건을 정확히 반영', () => {
    const cut: BoardDemand = { kind: 'cutWages', reward: 8, penalty: 10 };
    expect(evaluateDemand(cut, { wageUnderBudget: true, cupWon: false, clubTopScorer: false })).toBe(true);
    expect(evaluateDemand(cut, { wageUnderBudget: false, cupWon: true, clubTopScorer: true })).toBe(false);

    const cup: BoardDemand = { kind: 'winCup', reward: 12, penalty: 4 };
    expect(evaluateDemand(cup, { wageUnderBudget: false, cupWon: true, clubTopScorer: false })).toBe(true);
    expect(evaluateDemand(cup, { wageUnderBudget: true, cupWon: false, clubTopScorer: true })).toBe(false);

    const top: BoardDemand = { kind: 'clubTopScorer', reward: 12, penalty: 4 };
    expect(evaluateDemand(top, { wageUnderBudget: false, cupWon: false, clubTopScorer: true })).toBe(true);
  });

  it('신뢰도 변화: 달성 +reward, 실패 −penalty', () => {
    const d: BoardDemand = { kind: 'winCup', reward: 12, penalty: 4 };
    expect(demandConfidence(d, true)).toBe(12);
    expect(demandConfidence(d, false)).toBe(-4);
  });
});
