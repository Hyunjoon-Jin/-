import { describe, it, expect } from 'vitest';
import {
  sponsorContractPayout, signSponsorContract, SPONSOR_CONTRACT_LABEL,
} from '../src/finance.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function makeClub(seed = 1, tier = 12) {
  return generateClub(new Rng(seed), 'c', 'C', tier);
}

describe('고도화 Item15: 스폰서 다변화(소매 스폰서)', () => {
  it('소매 스폰서에도 라벨이 있다', () => {
    expect(SPONSOR_CONTRACT_LABEL.sleeve.length).toBeGreaterThan(0);
  });

  it('평판이 높을수록 소매 스폰서 시즌당 수익이 크다', () => {
    const low = sponsorContractPayout('sleeve', 3);
    const high = sponsorContractPayout('sleeve', 18);
    expect(high).toBeGreaterThan(low);
  });

  it('소매 스폰서는 스타디움 등급 없이도 체결할 수 있고, 유니폼 스폰서와 별개로 동시에 보유할 수 있다', () => {
    const club = makeClub(2);
    club.finance.stadiumLevel = 0;
    club.finance.balance = 1_000_000;
    club.finance.transferBudget = 0;
    const kitResult = signSponsorContract(club, 'kit');
    const sleeveResult = signSponsorContract(club, 'sleeve');
    expect(kitResult.ok).toBe(true);
    expect(sleeveResult.ok).toBe(true);
    expect(club.finance.sponsorContracts!.map((c) => c.kind).sort()).toEqual(['kit', 'sleeve']);
  });

  it('동일 종류(소매) 계약이 이미 진행 중이면 중복 체결할 수 없다', () => {
    const club = makeClub(3);
    club.finance.balance = 1_000_000;
    signSponsorContract(club, 'sleeve');
    const second = signSponsorContract(club, 'sleeve');
    expect(second.ok).toBe(false);
  });

  it('동일 평판에서 소매 스폰서는 유니폼 스폰서보다 수익이 낮다(보조 스폰서)', () => {
    const kit = sponsorContractPayout('kit', 10);
    const sleeve = sponsorContractPayout('sleeve', 10);
    expect(sleeve).toBeLessThan(kit);
  });
});
