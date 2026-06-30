import { describe, it, expect } from 'vitest';
import { ALL_ATTRS, type Attributes, type Club, type Player } from '../src/types.js';
import { marketValue, weeklyWage } from '../src/valuation.js';
import { settleSeason, leaguePrize } from '../src/finance.js';
import { runTransferWindow } from '../src/transfer.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import { formatMoney } from '../src/money.js';

/** 모든 능력치를 동일 값으로 채운 선수. CA = attrVal × 10. */
function makePlayer(opts: {
  attrVal: number; age: number; contractYears: number; potential?: number; id?: string;
}): Player {
  const attributes = {} as Attributes;
  for (const k of ALL_ATTRS) attributes[k] = opts.attrVal;
  const p: Player = {
    id: opts.id ?? 'p1',
    name: 'Test',
    nationality: 'KOR',
    age: opts.age,
    position: 'ST',
    familiarity: { ST: 1 },
    attributes,
    potential: opts.potential ?? opts.attrVal * 10,
    condition: 1,
    morale: 0.5,
    contractYears: opts.contractYears,
    wage: 0,
  };
  return p;
}

describe('valuation: 시장 가치', () => {
  it('CA가 높을수록 가치가 높다 (단조 증가)', () => {
    const lo = marketValue(makePlayer({ attrVal: 10, age: 25, contractYears: 3 }));
    const mid = marketValue(makePlayer({ attrVal: 14, age: 25, contractYears: 3 }));
    const hi = marketValue(makePlayer({ attrVal: 17, age: 25, contractYears: 3 }));
    expect(mid).toBeGreaterThan(lo);
    expect(hi).toBeGreaterThan(mid);
  });

  it('잠재력 큰 어린 선수가 같은 CA 노장보다 가치가 높다', () => {
    const young = marketValue(makePlayer({ attrVal: 13, age: 19, contractYears: 3, potential: 180 }));
    const old = marketValue(makePlayer({ attrVal: 13, age: 33, contractYears: 3, potential: 130 }));
    expect(young).toBeGreaterThan(old);
  });

  it('잔여 계약이 짧으면 가치가 낮다', () => {
    const long = marketValue(makePlayer({ attrVal: 14, age: 26, contractYears: 4 }));
    const short = marketValue(makePlayer({ attrVal: 14, age: 26, contractYears: 1 }));
    expect(short).toBeLessThan(long);
  });

  it('주급은 양수이고 CA와 함께 증가한다', () => {
    const lo = weeklyWage(makePlayer({ attrVal: 10, age: 26, contractYears: 3 }));
    const hi = weeklyWage(makePlayer({ attrVal: 16, age: 26, contractYears: 3 }));
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeGreaterThan(lo);
  });
});

describe('finance: 시즌 정산', () => {
  it('정산 후 balance가 net만큼 변한다', () => {
    const rng = new Rng(5);
    const club = generateClub(rng, 'c', 'C', 12);
    const before = club.finance.balance;
    const report = settleSeason(club, 3, 16);
    expect(club.finance.balance).toBe(before + report.net);
    expect(report.income.total).toBe(
      report.income.tv + report.income.matchday + report.income.sponsor + report.income.prize,
    );
  });

  it('우승 상금이 최하위 상금보다 많다', () => {
    expect(leaguePrize(0, 16)).toBeGreaterThan(leaguePrize(15, 16));
  });
});

describe('transfer: 이적 창 불변식', () => {
  function makeLeague(): Club[] {
    const rng = new Rng(99);
    const clubs: Club[] = [];
    for (let i = 0; i < 10; i++) {
      const tier = 8 + Math.round((i / 9) * 8);
      clubs.push(generateClub(rng, `c${i}`, `C${i}`, tier));
    }
    return clubs;
  }

  it('한 선수는 한 창에 한 번만 이적한다', () => {
    const deals = runTransferWindow(makeLeague(), 7);
    const ids = deals.map((d) => d.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('전체 선수 수는 이적 전후로 보존된다', () => {
    const clubs = makeLeague();
    const before = clubs.reduce((s, c) => s + c.players.length, 0);
    runTransferWindow(clubs, 7);
    const after = clubs.reduce((s, c) => s + c.players.length, 0);
    expect(after).toBe(before);
  });

  it('이적료는 매수 구단 예산 범위를 넘지 않는다', () => {
    const clubs = makeLeague();
    const budgetBefore = new Map(clubs.map((c) => [c.id, c.finance.transferBudget]));
    const deals = runTransferWindow(clubs, 7);
    for (const d of deals) {
      expect(d.fee).toBeLessThanOrEqual(budgetBefore.get(d.toClubId)!);
    }
  });
});

describe('money 포맷', () => {
  it('억/만원 변환', () => {
    expect(formatMoney(10_000)).toBe('1억원');
    expect(formatMoney(15_000)).toBe('1억 5,000만원');
    expect(formatMoney(3_000)).toBe('3,000만원');
  });
});
