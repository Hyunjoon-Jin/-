import { describe, it, expect } from 'vitest';
import { runTransferWindow, AI_MAX_DEALS_PER_CLUB } from '../src/transfer.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function makeLeague(seed: number, n = 12): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < n; i++) {
    const tier = 8 + Math.round((i / (n - 1)) * 8);
    clubs.push(generateClub(rng, `c${i}`, `C${i}`, tier));
  }
  // 다수 영입이 가능하도록 예산과 잔고를 넉넉히 준다.
  for (const c of clubs) {
    c.finance.transferBudget = 500_000_000;
    c.finance.balance = 500_000_000;
  }
  return clubs;
}

describe('고도화 Item6: AI-vs-AI 이적시장 리얼리즘 상향', () => {
  it('예산이 넉넉한 리그에서는 한 창에 같은 구단이 여러 건을 성사시킬 수 있다', () => {
    let sawMultiDealClub = false;
    for (let seed = 1; seed <= 20 && !sawMultiDealClub; seed++) {
      const clubs = makeLeague(seed);
      const deals = runTransferWindow(clubs, seed);
      const dealsPerBuyer = new Map<string, number>();
      for (const d of deals) dealsPerBuyer.set(d.toClubId, (dealsPerBuyer.get(d.toClubId) ?? 0) + 1);
      if ([...dealsPerBuyer.values()].some((n) => n > 1)) sawMultiDealClub = true;
    }
    expect(sawMultiDealClub).toBe(true);
  });

  it('어떤 구단도 창당 AI_MAX_DEALS_PER_CLUB건을 초과해 영입하지 않는다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const clubs = makeLeague(seed);
      const deals = runTransferWindow(clubs, seed);
      const dealsPerBuyer = new Map<string, number>();
      for (const d of deals) dealsPerBuyer.set(d.toClubId, (dealsPerBuyer.get(d.toClubId) ?? 0) + 1);
      for (const count of dealsPerBuyer.values()) expect(count).toBeLessThanOrEqual(AI_MAX_DEALS_PER_CLUB);
    }
  });

  it('같은 시드로 다시 실행하면 완전히 동일한 이적 목록이 나온다(재현성)', () => {
    const clubs1 = makeLeague(42);
    const clubs2 = makeLeague(42);
    const deals1 = runTransferWindow(clubs1, 42);
    const deals2 = runTransferWindow(clubs2, 42);
    expect(deals2).toEqual(deals1);
  });

  it('한 선수는 한 창에 한 번만 이적한다(다건 성사에도 불변식 유지)', () => {
    const clubs = makeLeague(3);
    const deals = runTransferWindow(clubs, 3);
    const ids = deals.map((d) => d.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('이적 후에도 어떤 구단의 이적 예산·보유 자금도 음수가 되지 않는다', () => {
    const clubs = makeLeague(4);
    runTransferWindow(clubs, 4);
    for (const c of clubs) {
      expect(c.finance.transferBudget).toBeGreaterThanOrEqual(0);
      expect(c.finance.balance).toBeGreaterThanOrEqual(0);
    }
  });
});
