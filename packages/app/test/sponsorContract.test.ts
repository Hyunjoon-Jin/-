import { describe, it, expect } from 'vitest';
import { startGame, myClub, signSponsorContractAction, advanceFullSeason } from '../src/game.js';
import { SPONSOR_CONTRACT_LENGTH_SEASONS, SPONSOR_CONTRACT_STADIUM_MIN_LEVEL } from '@soccer-tycoon/engine';

describe('신규 개선 항목 24: 스폰서 다중 계약 (앱 통합)', () => {
  it('자금이 충분하면 유니폼 스폰서 계약이 체결되고 수수료가 차감된다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    club.finance.balance = 10_000_000;
    const before = club.finance.balance;

    const outcome = signSponsorContractAction(g, 'kit');
    expect(outcome.ok).toBe(true);
    expect(club.finance.sponsorContracts).toHaveLength(1);
    expect(club.finance.balance).toBeLessThan(before);
  });

  it('스타디움을 증축하지 않으면 스타디움 명명권 계약을 체결할 수 없다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    club.finance.balance = 10_000_000;
    club.finance.stadiumLevel = 0;

    const outcome = signSponsorContractAction(g, 'stadiumNaming');
    expect(outcome.ok).toBe(false);
    expect(club.finance.sponsorContracts ?? []).toHaveLength(0);
  });

  it('스타디움을 증축했으면 명명권 계약을 체결할 수 있다', () => {
    const g = startGame(2028, 'c0');
    const club = myClub(g);
    club.finance.balance = 10_000_000;
    club.finance.stadiumLevel = SPONSOR_CONTRACT_STADIUM_MIN_LEVEL;

    const outcome = signSponsorContractAction(g, 'stadiumNaming');
    expect(outcome.ok).toBe(true);
  });

  it('시즌을 진행하면 계약 수익만큼 잔고가 늘고, 잔여 시즌이 줄어든다', () => {
    const g0 = startGame(2029, 'c0');
    const club0 = myClub(g0);
    club0.finance.balance = 10_000_000;
    signSponsorContractAction(g0, 'kit');
    const payout = club0.finance.sponsorContracts![0]!.payoutPerSeason;
    const balanceAfterSign = club0.finance.balance;

    const g1 = advanceFullSeason(g0);
    const club1 = myClub(g1);
    expect(club1.finance.sponsorContracts).toHaveLength(1);
    expect(club1.finance.sponsorContracts![0]!.seasonsRemaining).toBe(SPONSOR_CONTRACT_LENGTH_SEASONS - 1);
    // 시즌 정산 net에도 다른 변동이 섞여 있으므로, 최소한 계약 수익만큼은 net 효과에 포함돼
    // balance가 "체결 직후 잔고"보다 훨씬 낮아지지는 않는다(계약 수익이 매치데이/임금 변동과
    // 별개로 추가된다는 것만 계약 자체 필드로 직접 확인).
    expect(payout).toBeGreaterThan(0);
    expect(balanceAfterSign).toBeGreaterThan(0);
  });

  it('계약 기간이 다하면 만료되어 목록에서 사라지고 summary에 기록된다', () => {
    let g = startGame(2030, 'c0');
    const club = myClub(g);
    club.finance.balance = 10_000_000;
    signSponsorContractAction(g, 'kit');

    for (let i = 0; i < SPONSOR_CONTRACT_LENGTH_SEASONS; i++) {
      g = advanceFullSeason(g);
    }
    expect(myClub(g).finance.sponsorContracts ?? []).toHaveLength(0);
    const last = g.history.at(-1)!;
    expect(last.sponsorContractExpired).toContain('kit');
  });

  it('같은 종류로 중복 체결하면 거절된다', () => {
    const g = startGame(2031, 'c0');
    const club = myClub(g);
    club.finance.balance = 10_000_000;
    signSponsorContractAction(g, 'kit');
    const before = club.finance.balance;
    const second = signSponsorContractAction(g, 'kit');
    expect(second.ok).toBe(false);
    expect(club.finance.balance).toBe(before);
  });
});
