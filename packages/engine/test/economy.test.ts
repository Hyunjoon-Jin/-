import { describe, it, expect } from 'vitest';
import { ALL_ATTRS, type Attributes, type Club, type Player } from '../src/types.js';
import { marketValue, weeklyWage } from '../src/valuation.js';
import { settleSeason, leaguePrize } from '../src/finance.js';
import { runTransferWindow } from '../src/transfer.js';
import { wageBudget } from '../src/financeControl.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import { formatMoney } from '../src/money.js';

/** 모든 능력치를 동일 값으로 채운 선수. CA = attrVal × 10. */
function makePlayer(opts: {
  attrVal: number; age: number; contractYears: number; potential?: number; id?: string;
  morale?: number; careerInjuryCount?: number;
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
    morale: opts.morale ?? 0.5,
    contractYears: opts.contractYears,
    wage: 0,
    careerInjuryCount: opts.careerInjuryCount,
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

  it('고도화 항목7: 통산 부상 이력이 많을수록 시장 가치가 낮아진다', () => {
    const healthy = marketValue(makePlayer({ attrVal: 14, age: 26, contractYears: 3, careerInjuryCount: 0 }));
    const oneInjury = marketValue(makePlayer({ attrVal: 14, age: 26, contractYears: 3, careerInjuryCount: 1 }));
    const injuryProne = marketValue(makePlayer({ attrVal: 14, age: 26, contractYears: 3, careerInjuryCount: 8 }));
    expect(oneInjury).toBe(healthy); // 1건까지는 정상 리스크로 보아 페널티 없음
    expect(injuryProne).toBeLessThan(oneInjury);
  });

  it('고도화 항목7: 부상 이력에 따른 할인은 최대 20%로 하한이 있다', () => {
    const healthy = marketValue(makePlayer({ attrVal: 14, age: 26, contractYears: 3, careerInjuryCount: 0 }));
    const veryInjuryProne = marketValue(makePlayer({ attrVal: 14, age: 26, contractYears: 3, careerInjuryCount: 50 }));
    expect(veryInjuryProne).toBeGreaterThanOrEqual(Math.round(healthy * 0.8) - 1);
  });

  it('고도화 항목7: 사기(폼)가 높을수록 시장 가치가 높아진다', () => {
    const lowMorale = marketValue(makePlayer({ attrVal: 14, age: 26, contractYears: 3, morale: 0.1 }));
    const neutral = marketValue(makePlayer({ attrVal: 14, age: 26, contractYears: 3, morale: 0.5 }));
    const highMorale = marketValue(makePlayer({ attrVal: 14, age: 26, contractYears: 3, morale: 1.0 }));
    expect(lowMorale).toBeLessThan(neutral);
    expect(highMorale).toBeGreaterThan(neutral);
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

  it('잔고가 크게 불어나면 이적 예산도 함께 커진다(성공한 구단이 계속 쓸 수 있도록)', () => {
    const rng = new Rng(6);
    const club = generateClub(rng, 'c', 'C', 12);
    const budgetBefore = club.finance.transferBudget;
    club.finance.balance = 1_000_000; // 시즌 성공으로 잔고가 크게 불어난 상황을 가정
    settleSeason(club, 0, 16);
    expect(club.finance.transferBudget).toBeGreaterThan(budgetBefore);
    expect(club.finance.transferBudget).toBeGreaterThanOrEqual(Math.round(club.finance.balance * 0.4) - 1);
  });

  it('매각으로 이미 이적 예산이 그 기준보다 높다면 정산 후에도 줄어들지 않는다', () => {
    const rng = new Rng(7);
    const club = generateClub(rng, 'c', 'C', 12);
    club.finance.balance = 10_000;
    club.finance.transferBudget = 900_000; // 매각 등으로 이미 잔고 대비 훨씬 큰 예산 보유
    settleSeason(club, 10, 16);
    expect(club.finance.transferBudget).toBeGreaterThanOrEqual(900_000);
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

  it('이적 후에도 어떤 구단의 이적 예산도 음수가 되지 않는다', () => {
    // (매도로 예산이 늘 수 있으므로 시작 예산이 아니라 '음수 불가'가 올바른 불변식)
    const clubs = makeLeague();
    const deals = runTransferWindow(clubs, 7);
    for (const d of deals) expect(d.fee).toBeGreaterThan(0);
    for (const c of clubs) expect(c.finance.transferBudget).toBeGreaterThanOrEqual(0);
  });

  it('이적 후에도 어떤 구단의 보유 자금도 음수가 되지 않는다', () => {
    const clubs = makeLeague();
    runTransferWindow(clubs, 7);
    for (const c of clubs) expect(c.finance.balance).toBeGreaterThanOrEqual(0);
  });

  it('임금 예산이 이미 한계까지 찬 구단은 이적료를 감당할 수 있어도 AI 영입을 하지 않는다', () => {
    const clubs = makeLeague();
    const buyer = clubs.find((c) => c.id === 'c0')!;
    buyer.finance.transferBudget = 999_999_999;
    buyer.finance.balance = 999_999_999;
    // 기존 스쿼드 임금만으로 이미 지속가능 예산을 채운다 — 추가 영입은 어떤 선수든 초과.
    const perPlayerWage = Math.ceil(wageBudget(buyer) / 52 / buyer.players.length) + 100;
    for (const p of buyer.players) p.wage = perPlayerWage;

    const deals = runTransferWindow(clubs, 7);
    expect(deals.some((d) => d.toClubId === buyer.id)).toBe(false);
  });
});

describe('money 포맷', () => {
  it('억/만원 변환', () => {
    expect(formatMoney(10_000)).toBe('1억원');
    expect(formatMoney(15_000)).toBe('1억 5,000만원');
    expect(formatMoney(3_000)).toBe('3,000만원');
  });

  it('반올림 후 0이 되는 소수 음수 입력은 "-0만원"이 아니라 "0만원"을 표시한다', () => {
    expect(formatMoney(-0.3)).toBe('0만원');
    expect(formatMoney(-0)).toBe('0만원');
    expect(formatMoney(-1)).toBe('-1만원'); // 반올림 후에도 음수면 부호 유지
  });
});
