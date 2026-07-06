import { describe, it, expect } from 'vitest';
import { startGame, myClub, offersFor, acceptSell, buyback } from '../src/game.js';

describe('신규 개선 항목 2: 바이백 조항 (앱 통합)', () => {
  it('바이백 금액을 지정해 판매하면 이후 buyback 액션으로 재영입할 수 있다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    const offers = offersFor(g, player.id);
    expect(offers.length).toBeGreaterThan(0);
    const buyerId = offers[0]!.clubId;
    const buybackFee = offers[0]!.bid + 20000;

    const soldOutcome = acceptSell(g, player.id, buyerId, buybackFee);
    expect(soldOutcome.ok).toBe(true);
    expect(myClub(soldOutcome.state).players.some((p) => p.id === player.id)).toBe(false);

    const boughtBackOutcome = buyback(soldOutcome.state, player.id);
    expect(boughtBackOutcome.ok).toBe(true);
    expect(myClub(boughtBackOutcome.state).players.some((p) => p.id === player.id)).toBe(true);
  });

  it('바이백 없이 판매한 선수는 buyback 액션이 거절된다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    const offers = offersFor(g, player.id);
    const buyerId = offers[0]!.clubId;

    const soldOutcome = acceptSell(g, player.id, buyerId);
    expect(soldOutcome.ok).toBe(true);
    const boughtBackOutcome = buyback(soldOutcome.state, player.id);
    expect(boughtBackOutcome.ok).toBe(false);
  });
});
