import { describe, it, expect } from 'vitest';
import { startGame, myClub, offersFor, acceptSell, attachAddOn } from '../src/game.js';

describe('신규 개선 항목 3: 성과 기반 후불 이적료(Add-on, 앱 통합)', () => {
  it('판매 후 조건을 붙이면 구매 구단 선수의 addOnClause에 반영된다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    const offers = offersFor(g, player.id);
    expect(offers.length).toBeGreaterThan(0);
    const buyerId = offers[0]!.clubId;

    const soldOutcome = acceptSell(g, player.id, buyerId);
    expect(soldOutcome.ok).toBe(true);

    const attached = attachAddOn(soldOutcome.state, player.id, 15, undefined, 20000);
    expect(attached.ok).toBe(true);
    const buyerClub = attached.state.clubs.find((c) => c.id === buyerId)!;
    const soldPlayer = buyerClub.players.find((p) => p.id === player.id)!;
    expect(soldPlayer.addOnClause).toEqual({ sellerClubId: g.myClubId, appearances: 15, goals: undefined, fee: 20000 });
  });

  it('출전·득점 조건을 모두 생략하면 거절된다', () => {
    const g = startGame(2028, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    const offers = offersFor(g, player.id);
    const buyerId = offers[0]!.clubId;

    const soldOutcome = acceptSell(g, player.id, buyerId);
    const attached = attachAddOn(soldOutcome.state, player.id, undefined, undefined, 20000);
    expect(attached.ok).toBe(false);
  });
});
