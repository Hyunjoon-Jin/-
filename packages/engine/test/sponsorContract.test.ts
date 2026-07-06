import { describe, it, expect } from 'vitest';
import {
  sponsorContractPayout, signSponsorContract, tickSponsorContracts,
  SPONSOR_CONTRACT_LABEL, SPONSOR_CONTRACT_LENGTH_SEASONS, SPONSOR_CONTRACT_SIGN_FEE_MULTIPLIER,
  SPONSOR_CONTRACT_STADIUM_MIN_LEVEL,
} from '../src/finance.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function makeClub(seed = 1, tier = 12) {
  return generateClub(new Rng(seed), 'c', 'C', tier);
}

describe('신규 개선 항목 24: 스폰서 다중 계약(유니폼/스타디움 명명권)', () => {
  it('모든 계약 종류에 라벨이 있다', () => {
    expect(SPONSOR_CONTRACT_LABEL.kit.length).toBeGreaterThan(0);
    expect(SPONSOR_CONTRACT_LABEL.stadiumNaming.length).toBeGreaterThan(0);
  });

  it('평판이 높을수록 계약 시즌당 수익이 크다', () => {
    const low = sponsorContractPayout('kit', 3);
    const high = sponsorContractPayout('kit', 18);
    expect(high).toBeGreaterThan(low);
  });

  it('스타디움 명명권은 스타디움 규모가 클수록 수익이 더 크다', () => {
    const base = sponsorContractPayout('stadiumNaming', 10, 0);
    const upgraded = sponsorContractPayout('stadiumNaming', 10, 5);
    expect(upgraded).toBeGreaterThan(base);
  });

  it('유니폼 계약은 스타디움 등급 없이도 체결할 수 있다', () => {
    const club = makeClub(1);
    club.finance.stadiumLevel = 0;
    club.finance.balance = 1_000_000;
    const result = signSponsorContract(club, 'kit');
    expect(result.ok).toBe(true);
    expect(result.contract!.seasonsRemaining).toBe(SPONSOR_CONTRACT_LENGTH_SEASONS);
    expect(club.finance.sponsorContracts).toHaveLength(1);
  });

  it('스타디움 명명권은 스타디움을 최소 단계 증축하기 전엔 체결할 수 없다', () => {
    const club = makeClub(2);
    club.finance.stadiumLevel = 0;
    club.finance.balance = 1_000_000;
    const result = signSponsorContract(club, 'stadiumNaming');
    expect(result.ok).toBe(false);
    expect(club.finance.sponsorContracts ?? []).toHaveLength(0);
  });

  it('스타디움을 최소 단계 이상 증축했으면 명명권 계약이 가능하다', () => {
    const club = makeClub(3);
    club.finance.stadiumLevel = SPONSOR_CONTRACT_STADIUM_MIN_LEVEL;
    club.finance.balance = 1_000_000;
    const result = signSponsorContract(club, 'stadiumNaming');
    expect(result.ok).toBe(true);
  });

  it('체결 수수료만큼 잔고에서 즉시 차감된다', () => {
    const club = makeClub(4);
    club.finance.balance = 1_000_000;
    const before = club.finance.balance;
    const result = signSponsorContract(club, 'kit');
    const expectedCost = Math.round(result.contract!.payoutPerSeason * SPONSOR_CONTRACT_SIGN_FEE_MULTIPLIER);
    expect(result.cost).toBe(expectedCost);
    expect(club.finance.balance).toBe(before - expectedCost);
  });

  it('자금이 수수료보다 부족하면 체결이 거부되고 잔고가 그대로다', () => {
    const club = makeClub(5);
    club.finance.balance = 1;
    const before = club.finance.balance;
    const result = signSponsorContract(club, 'kit');
    expect(result.ok).toBe(false);
    expect(club.finance.balance).toBe(before);
    expect(club.finance.sponsorContracts ?? []).toHaveLength(0);
  });

  it('같은 종류의 계약이 이미 있으면 중복 체결할 수 없다', () => {
    const club = makeClub(6);
    club.finance.balance = 1_000_000;
    signSponsorContract(club, 'kit');
    const before = club.finance.balance;
    const second = signSponsorContract(club, 'kit');
    expect(second.ok).toBe(false);
    expect(club.finance.balance).toBe(before); // 두 번째 시도에서 수수료가 또 빠지지 않음
    expect(club.finance.sponsorContracts).toHaveLength(1);
  });

  it('종류가 다르면 동시에 두 계약을 유지할 수 있다', () => {
    const club = makeClub(7);
    club.finance.stadiumLevel = SPONSOR_CONTRACT_STADIUM_MIN_LEVEL;
    club.finance.balance = 1_000_000;
    signSponsorContract(club, 'kit');
    const second = signSponsorContract(club, 'stadiumNaming');
    expect(second.ok).toBe(true);
    expect(club.finance.sponsorContracts).toHaveLength(2);
  });

  it('계약이 없으면 tick은 수익 0, 만료 없음을 반환한다(하위 호환)', () => {
    const club = makeClub(8);
    const result = tickSponsorContracts(club);
    expect(result.income).toBe(0);
    expect(result.expired).toHaveLength(0);
    expect(club.finance.sponsorContracts).toHaveLength(0);
  });

  it('tick은 활성 계약분 수익을 합산하고 잔여 시즌을 1 줄인다', () => {
    const club = makeClub(9);
    club.finance.balance = 1_000_000;
    signSponsorContract(club, 'kit');
    const payout = club.finance.sponsorContracts![0]!.payoutPerSeason;
    const result = tickSponsorContracts(club);
    expect(result.income).toBe(payout);
    expect(club.finance.sponsorContracts![0]!.seasonsRemaining).toBe(SPONSOR_CONTRACT_LENGTH_SEASONS - 1);
  });

  it('잔여 시즌이 0이 되면 계약이 만료되어 목록에서 제거되고 expired에 담긴다', () => {
    const club = makeClub(10);
    club.finance.balance = 1_000_000;
    signSponsorContract(club, 'kit');
    let last;
    for (let i = 0; i < SPONSOR_CONTRACT_LENGTH_SEASONS; i++) {
      last = tickSponsorContracts(club);
    }
    expect(club.finance.sponsorContracts).toHaveLength(0);
    expect(last!.expired).toHaveLength(1);
    expect(last!.expired[0]!.kind).toBe('kit');
  });

  it('payoutPerSeason은 체결 시점 평판에 고정되며, 이후 평판이 올라도 바뀌지 않는다', () => {
    const club = makeClub(11);
    club.finance.balance = 1_000_000;
    signSponsorContract(club, 'kit');
    const lockedPayout = club.finance.sponsorContracts![0]!.payoutPerSeason;
    club.finance.reputation += 5;
    tickSponsorContracts(club); // 재계약하지 않는 한 payoutPerSeason은 그대로
    // 계약이 만료되지 않았다면(잔여>0) 여전히 원래 계약 배열에 값이 남아있어야 함
    if (club.finance.sponsorContracts!.length > 0) {
      expect(club.finance.sponsorContracts![0]!.payoutPerSeason).toBe(lockedPayout);
    }
  });
});
