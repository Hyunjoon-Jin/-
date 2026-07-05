import { describe, it, expect } from 'vitest';
import {
  sellOffers, acceptSellOffer, exerciseBuyback, BUYBACK_MAX_SEASONS,
} from '../src/transferActions.js';
import { runOffseason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function league(seed: number, n = 6): { clubs: Club[]; myId: string } {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < n; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 8 + i));
  for (const c of clubs) c.finance.transferBudget = 300_000_000;
  return { clubs, myId: 'c0' };
}

describe('신규 개선 항목 2: 바이백 조항', () => {
  it('바이백 금액을 지정해 판매하면 선수에게 buybackClause가 붙는다', () => {
    const { clubs, myId } = league(1);
    const me = clubs.find((c) => c.id === myId)!;
    const player = me.players[0]!;
    const offer = sellOffers(clubs, myId, player.id)[0]!;
    const r = acceptSellOffer(clubs, myId, player.id, offer.clubId, offer.bid + 5000);
    expect(r.ok).toBe(true);
    expect(player.buybackClause).toEqual({ clubId: myId, fee: offer.bid + 5000, seasonsRemaining: BUYBACK_MAX_SEASONS });
  });

  it('바이백 금액이 판매가 미만이면 거절된다', () => {
    const { clubs, myId } = league(2);
    const me = clubs.find((c) => c.id === myId)!;
    const player = me.players[0]!;
    const offer = sellOffers(clubs, myId, player.id)[0]!;
    const r = acceptSellOffer(clubs, myId, player.id, offer.clubId, offer.bid - 1);
    expect(r.ok).toBe(false);
  });

  it('바이백을 지정하지 않으면(생략) 조항이 붙지 않는다(하위 호환)', () => {
    const { clubs, myId } = league(3);
    const me = clubs.find((c) => c.id === myId)!;
    const player = me.players[0]!;
    const offer = sellOffers(clubs, myId, player.id)[0]!;
    const r = acceptSellOffer(clubs, myId, player.id, offer.clubId);
    expect(r.ok).toBe(true);
    expect(player.buybackClause).toBeUndefined();
  });

  it('바이백 권리가 있으면 원 소속 구단이 조항 금액으로 즉시 재영입할 수 있다', () => {
    const { clubs, myId } = league(4);
    const me = clubs.find((c) => c.id === myId)!;
    const player = me.players[0]!;
    const offer = sellOffers(clubs, myId, player.id)[0]!;
    const buybackFee = offer.bid + 10000;
    acceptSellOffer(clubs, myId, player.id, offer.clubId, buybackFee);
    const balBefore = me.finance.balance;

    const r = exerciseBuyback(clubs, myId, player.id);
    expect(r.ok).toBe(true);
    expect(r.fee).toBe(buybackFee);
    expect(me.players.some((p) => p.id === player.id)).toBe(true);
    expect(me.finance.balance).toBe(balBefore - buybackFee);
    expect(player.buybackClause).toBeUndefined();
  });

  it('바이백 권리가 없는 선수는 행사할 수 없다', () => {
    const { clubs, myId } = league(5);
    const me = clubs.find((c) => c.id === myId)!;
    const player = me.players[0]!;
    const offer = sellOffers(clubs, myId, player.id)[0]!;
    acceptSellOffer(clubs, myId, player.id, offer.clubId); // 바이백 없이 판매
    const r = exerciseBuyback(clubs, myId, player.id);
    expect(r.ok).toBe(false);
  });

  it('다른 구단이 보유한 바이백 권리는 행사할 수 없다(clubId 불일치)', () => {
    const { clubs, myId } = league(6);
    const me = clubs.find((c) => c.id === myId)!;
    const player = me.players[0]!;
    const offer = sellOffers(clubs, myId, player.id)[0]!;
    acceptSellOffer(clubs, myId, player.id, offer.clubId, offer.bid + 5000);
    const thirdParty = clubs.find((c) => c.id !== myId && c.id !== offer.clubId)!;
    const r = exerciseBuyback(clubs, thirdParty.id, player.id);
    expect(r.ok).toBe(false);
  });

  it(`오프시즌을 ${BUYBACK_MAX_SEASONS}회 넘게 진행하면 바이백 조항이 자동 소멸한다`, () => {
    const { clubs, myId } = league(7);
    const me = clubs.find((c) => c.id === myId)!;
    const player = me.players[0]!;
    player.age = 20; // 은퇴 위험 없이 여러 오프시즌을 통과시키기 위함
    const offer = sellOffers(clubs, myId, player.id)[0]!;
    acceptSellOffer(clubs, myId, player.id, offer.clubId, offer.bid + 5000);

    for (let i = 0; i <= BUYBACK_MAX_SEASONS; i++) {
      runOffseason(clubs, new Rng(100 + i));
    }
    expect(player.buybackClause).toBeUndefined();
    const r = exerciseBuyback(clubs, myId, player.id);
    expect(r.ok).toBe(false);
  });
});
