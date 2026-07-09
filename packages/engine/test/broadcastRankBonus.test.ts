import { describe, it, expect } from 'vitest';
import { settleSeason } from '../src/finance.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

describe('고도화 Item16: 중계권료 순위 배당', () => {
  it('같은 평판이면 순위가 높을수록(1위에 가까울수록) 중계권료가 더 크다', () => {
    const rng1 = new Rng(1);
    const first = generateClub(rng1, 'c1', 'First', 12);
    const rng2 = new Rng(1);
    const last = generateClub(rng2, 'c2', 'Last', 12);
    last.finance.reputation = first.finance.reputation; // 순위 외 조건을 동일하게

    const firstReport = settleSeason(first, 0, 16);
    const lastReport = settleSeason(last, 15, 16);
    expect(firstReport.income.tv).toBeGreaterThan(lastReport.income.tv);
  });

  it('순위가 같으면 평판이 높을수록 중계권료가 더 크다(기존 평판 비례분 유지)', () => {
    const rng = new Rng(2);
    const lowRep = generateClub(rng, 'c3', 'Low', 5);
    const highRep = generateClub(new Rng(2), 'c4', 'High', 18);
    const lowReport = settleSeason(lowRep, 3, 16);
    const highReport = settleSeason(highRep, 3, 16);
    expect(highReport.income.tv).toBeGreaterThan(lowReport.income.tv);
  });

  it('꼴찌는 순위 배당 없이 평판 비례분만 받는다(순위 배당 하한 0)', () => {
    const rng = new Rng(3);
    const club = generateClub(rng, 'c5', 'C', 10);
    const rep = club.finance.reputation;
    const report = settleSeason(club, 15, 16);
    // 순위 배당이 없으면 tv = 45_000 + rep*48_000 이어야 한다.
    expect(report.income.tv).toBe(45_000 + rep * 48_000);
  });

  it('총수입은 tv·matchday·sponsor·prize의 합과 정확히 일치한다', () => {
    const rng = new Rng(4);
    const club = generateClub(rng, 'c6', 'C', 12);
    const report = settleSeason(club, 2, 16);
    expect(report.income.total).toBe(
      report.income.tv + report.income.matchday + report.income.sponsor + report.income.prize,
    );
  });
});
