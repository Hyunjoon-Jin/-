import { describe, it, expect } from 'vitest';
import { startGame, myClub, offersFor, acceptSell, attachAddOn } from '../src/game.js';

describe('신규 개선 항목 3 → 고도화 항목4: 성과 기반 후불 이적료(Add-on, 앱 통합)', () => {
  it('판매 후 티어를 붙이면 구매 구단 선수의 addOnClause에 반영된다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    const offers = offersFor(g, player.id);
    expect(offers.length).toBeGreaterThan(0);
    const buyerId = offers[0]!.clubId;

    const soldOutcome = acceptSell(g, player.id, buyerId);
    expect(soldOutcome.ok).toBe(true);

    const tiers = [{ kind: 'appearances' as const, threshold: 15, fee: 20000 }];
    const attached = attachAddOn(soldOutcome.state, player.id, tiers);
    expect(attached.ok).toBe(true);
    const buyerClub = attached.state.clubs.find((c) => c.id === buyerId)!;
    const soldPlayer = buyerClub.players.find((p) => p.id === player.id)!;
    expect(soldPlayer.addOnClause).toEqual({ sellerClubId: g.myClubId, tiers });
  });

  it('다단계 티어도 그대로 반영된다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    const offers = offersFor(g, player.id);
    const buyerId = offers[0]!.clubId;

    const soldOutcome = acceptSell(g, player.id, buyerId);
    const tiers = [
      { kind: 'goals' as const, threshold: 10, fee: 20000 },
      { kind: 'goals' as const, threshold: 20, fee: 50000 },
    ];
    const attached = attachAddOn(soldOutcome.state, player.id, tiers);
    expect(attached.ok).toBe(true);
    const buyerClub = attached.state.clubs.find((c) => c.id === buyerId)!;
    const soldPlayer = buyerClub.players.find((p) => p.id === player.id)!;
    expect(soldPlayer.addOnClause?.tiers).toHaveLength(2);
  });

  it('티어를 하나도 지정하지 않으면 거절된다', () => {
    const g = startGame(2028, 'c0');
    const club = myClub(g);
    const player = club.players[0]!;
    const offers = offersFor(g, player.id);
    const buyerId = offers[0]!.clubId;

    const soldOutcome = acceptSell(g, player.id, buyerId);
    const attached = attachAddOn(soldOutcome.state, player.id, []);
    expect(attached.ok).toBe(false);
  });
});
