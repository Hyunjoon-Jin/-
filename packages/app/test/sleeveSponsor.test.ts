import { describe, it, expect } from 'vitest';
import { startGame, myClub, signSponsorContractAction } from '../src/game.js';

describe('고도화 Item15: 스폰서 다변화(소매 스폰서) (앱 통합)', () => {
  it('자금이 충분하면 소매 스폰서 계약이 체결되고, 유니폼 스폰서와 동시에 보유할 수 있다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    club.finance.balance = 10_000_000;

    const kitOutcome = signSponsorContractAction(g, 'kit');
    const sleeveOutcome = signSponsorContractAction(g, 'sleeve');
    expect(kitOutcome.ok).toBe(true);
    expect(sleeveOutcome.ok).toBe(true);
    expect(club.finance.sponsorContracts).toHaveLength(2);
  });

  it('이미 소매 스폰서 계약이 진행 중이면 중복 체결할 수 없다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    club.finance.balance = 10_000_000;
    signSponsorContractAction(g, 'sleeve');
    const second = signSponsorContractAction(g, 'sleeve');
    expect(second.ok).toBe(false);
  });
});
