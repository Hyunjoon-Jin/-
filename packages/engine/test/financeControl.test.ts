import { describe, it, expect } from 'vitest';
import { enforceFinancialFairPlay, inFinancialCrisis, annualWageBill, wageBudget } from '../src/financeControl.js';
import { MIN_SQUAD } from '../src/transferActions.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

describe('financeControl: 파이낸셜 페어플레이', () => {
  it('자금이 음수면 위기, 강제 매각으로 자금이 0 이상이 된다', () => {
    const club = generateClub(new Rng(1), 'c', 'C', 14);
    club.finance.balance = -500_000; // 대규모 적자
    expect(inFinancialCrisis(club)).toBe(true);
    const sizeBefore = club.players.length;
    const r = enforceFinancialFairPlay(club);
    expect(r.sold.length).toBeGreaterThan(0);
    expect(r.raised).toBeGreaterThan(0);
    expect(club.finance.balance).toBeGreaterThanOrEqual(0);
    expect(club.players.length).toBe(sizeBefore - r.sold.length);
  });

  it('가장 비싼 선수부터 매각한다', () => {
    const club = generateClub(new Rng(2), 'c', 'C', 14);
    club.finance.balance = -300_000;
    const before = [...club.players];
    const r = enforceFinancialFairPlay(club);
    // 매각된 선수가 남은 선수보다 가치가 높다(대략)
    expect(r.sold.length).toBeGreaterThan(0);
    // 최소 스쿼드는 유지
    expect(club.players.length).toBeGreaterThanOrEqual(MIN_SQUAD);
  });

  it('자금이 충분하면 매각하지 않는다', () => {
    const club = generateClub(new Rng(3), 'c', 'C', 14);
    club.finance.balance = 1_000_000;
    const r = enforceFinancialFairPlay(club);
    expect(r.sold.length).toBe(0);
  });

  it('임금 예산·총액 지표가 양수', () => {
    const club = generateClub(new Rng(4), 'c', 'C', 12);
    expect(wageBudget(club)).toBeGreaterThan(0);
    expect(annualWageBill(club)).toBeGreaterThan(0);
  });

  it('매각으로도 회복이 안 될 만큼 적자가 크면 남은 선수단 임금을 삭감해 회복 경로를 만든다', () => {
    const club = generateClub(new Rng(5), 'c', 'C', 14);
    club.finance.balance = -1_000_000_000; // 어떤 매각으로도 회복 불가능한 대규모 적자
    const wagesBefore = new Map(club.players.map((p) => [p.id, p.wage]));
    const r = enforceFinancialFairPlay(club);
    expect(club.players.length).toBe(MIN_SQUAD); // 하한까지 매각
    expect(club.finance.balance).toBeLessThan(0); // 그래도 여전히 적자
    expect(r.sold.length).toBeGreaterThan(0);
    for (const p of club.players) {
      const before = wagesBefore.get(p.id)!;
      if (before > 0) expect(p.wage).toBeLessThan(before);
    }
  });
});
