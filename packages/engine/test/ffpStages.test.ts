import { describe, it, expect } from 'vitest';
import { applyFinancialControl, inFinancialCrisis } from '../src/financeControl.js';
import { MIN_SQUAD } from '../src/transferActions.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

describe('고도화 Item21: FFP 경고 단계 세분화', () => {
  it('자금이 충분하면 단계는 ok이고 스트릭은 0으로 유지된다', () => {
    const club = generateClub(new Rng(1), 'c', 'C', 12);
    club.finance.balance = 1_000_000;
    const r = applyFinancialControl(club);
    expect(r.stage).toBe('ok');
    expect(r.crisisStreak).toBe(0);
    expect(club.finance.financialCrisisStreak).toBe(0);
  });

  it('첫 적자 시즌은 경고 단계 — 선수를 매각하지 않고 이적 예산만 동결한다', () => {
    const club = generateClub(new Rng(2), 'c', 'C', 12);
    club.finance.balance = -100_000;
    club.finance.transferBudget = 500_000;
    const sizeBefore = club.players.length;
    const r = applyFinancialControl(club);
    expect(r.stage).toBe('warning');
    expect(r.sold).toHaveLength(0);
    expect(club.players.length).toBe(sizeBefore);
    expect(club.finance.transferBudget).toBe(0);
    expect(club.finance.financialCrisisStreak).toBe(1);
  });

  it('2시즌 연속 적자는 제재 단계 — 여전히 매각 없이 임금이 삭감된다', () => {
    const club = generateClub(new Rng(3), 'c', 'C', 12);
    club.finance.balance = -100_000;
    applyFinancialControl(club); // 1시즌째: 경고
    club.finance.balance = -100_000; // 2시즌째도 여전히 적자
    const wagesBefore = new Map(club.players.map((p) => [p.id, p.wage]));
    const r = applyFinancialControl(club);
    expect(r.stage).toBe('sanction');
    expect(r.sold).toHaveLength(0);
    for (const p of club.players) {
      const before = wagesBefore.get(p.id)!;
      if (before > 0) expect(p.wage).toBeLessThan(before);
    }
    expect(club.finance.financialCrisisStreak).toBe(2);
  });

  it('3시즌 연속 적자부터 강제매각 단계로 전환된다', () => {
    const club = generateClub(new Rng(4), 'c', 'C', 14);
    club.finance.balance = -500_000;
    applyFinancialControl(club); // 1: 경고
    club.finance.balance = -500_000;
    applyFinancialControl(club); // 2: 제재
    club.finance.balance = -500_000;
    const r = applyFinancialControl(club); // 3: 강제매각
    expect(r.stage).toBe('forcedSale');
    expect(r.sold.length).toBeGreaterThan(0);
    expect(club.players.length).toBeGreaterThanOrEqual(MIN_SQUAD);
    expect(club.finance.financialCrisisStreak).toBe(3);
  });

  it('중간에 흑자로 돌아서면 스트릭이 리셋돼 다시 경고 단계부터 시작한다', () => {
    const club = generateClub(new Rng(5), 'c', 'C', 12);
    club.finance.balance = -100_000;
    applyFinancialControl(club); // 1: 경고
    club.finance.balance = 1_000_000; // 흑자로 회복
    const ok = applyFinancialControl(club);
    expect(ok.stage).toBe('ok');
    expect(club.finance.financialCrisisStreak).toBe(0);

    club.finance.balance = -100_000; // 다시 적자 시작
    const restarted = applyFinancialControl(club);
    expect(restarted.stage).toBe('warning'); // 이전 스트릭이 이어지지 않고 처음부터
    expect(inFinancialCrisis(club)).toBe(true);
  });
});
