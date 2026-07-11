import { describe, it, expect } from 'vitest';
import {
  reputationTier, reputationDelta, applyReputation, START_REPUTATION,
  REPUTATION_TIER_LABEL, type ReputationInput,
} from '../src/managerCareer.js';

function base(over: Partial<ReputationInput> = {}): ReputationInput {
  return {
    position: 5, objective: 8, leagueSize: 12, division: 1,
    leagueTitle: false, cupTitle: false, promoted: false, relegated: false,
    clubReputation: 50, currentReputation: START_REPUTATION,
    ...over,
  };
}

describe('감독 평판 등급(B1)', () => {
  it('평판 구간마다 등급이 매겨진다', () => {
    expect(reputationTier(10)).toBe('unknown');
    expect(reputationTier(30)).toBe('promising');
    expect(reputationTier(50)).toBe('respected');
    expect(reputationTier(70)).toBe('elite');
    expect(reputationTier(90)).toBe('legendary');
    expect(REPUTATION_TIER_LABEL.legendary).toContain('전설');
  });
});

describe('평판 변화량(B1)', () => {
  it('목표 초과 달성은 평판을 올린다', () => {
    expect(reputationDelta(base({ position: 3, objective: 8 }))).toBeGreaterThan(0);
  });

  it('목표 미달은 평판을 떨어뜨린다', () => {
    expect(reputationDelta(base({ position: 11, objective: 8 }))).toBeLessThan(0);
  });

  it('1부 리그 우승이 2부 우승보다 평판 상승이 크다', () => {
    const d1 = reputationDelta(base({ position: 1, objective: 4, leagueTitle: true, division: 1 }));
    const d2 = reputationDelta(base({ position: 1, objective: 4, leagueTitle: true, division: 2 }));
    expect(d1).toBeGreaterThan(d2);
  });

  it('강등은 큰 감점, 승격은 가점', () => {
    expect(reputationDelta(base({ position: 12, objective: 8, relegated: true }))).toBeLessThan(-3);
    expect(reputationDelta(base({ position: 2, objective: 3, promoted: true }))).toBeGreaterThan(0);
  });

  it('작은 구단으로 목표 초과 시 오버퍼폼 보너스가 붙는다', () => {
    const underdog = reputationDelta(base({ position: 4, objective: 8, clubReputation: 20 }));
    const bigClub = reputationDelta(base({ position: 4, objective: 8, clubReputation: 70 }));
    expect(underdog).toBeGreaterThan(bigClub);
  });

  it('평판이 높으면 상승폭이 둔화된다(수렴)', () => {
    const low = reputationDelta(base({ position: 1, objective: 4, leagueTitle: true, currentReputation: 30 }));
    const high = reputationDelta(base({ position: 1, objective: 4, leagueTitle: true, currentReputation: 90 }));
    expect(high).toBeLessThan(low);
    expect(high).toBeGreaterThan(0); // 그래도 우승은 오른다
  });

  it('하락분은 평판이 높아도 둔화되지 않는다', () => {
    const low = reputationDelta(base({ position: 12, objective: 8, relegated: true, currentReputation: 30 }));
    const high = reputationDelta(base({ position: 12, objective: 8, relegated: true, currentReputation: 90 }));
    expect(high).toBe(low);
  });
});

describe('평판 적용', () => {
  it('0~100 범위로 클램프된다', () => {
    expect(applyReputation(98, 10)).toBe(100);
    expect(applyReputation(3, -10)).toBe(0);
    expect(applyReputation(50, 5)).toBe(55);
  });
});
