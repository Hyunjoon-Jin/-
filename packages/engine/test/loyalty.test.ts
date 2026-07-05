import { describe, it, expect } from 'vitest';
import {
  loyaltyTier, loyaltyDiscount, LOYALTY_TRUSTED_SEASONS, LOYALTY_LEGEND_SEASONS, LOYALTY_MAX_DISCOUNT,
} from '../src/valuation.js';
import {
  sellOffers, acceptSellOffer, swapPlayers, buyPlayerAt, askingPrice, loanPlayerOut,
} from '../src/transferActions.js';
import { runOffseason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function twoClubs(seed: number): { clubs: Club[]; myId: string } {
  const rng = new Rng(seed);
  const me = generateClub(rng, 'me', 'Me', 14);
  const other = generateClub(rng, 'ot', 'Other', 14);
  me.finance.transferBudget = 500_000_000;
  me.finance.balance = 500_000_000;
  return { clubs: [me, other], myId: 'me' };
}

describe('신규 개선 항목 10: 로열티 보너스', () => {
  it('등급 분류가 경계값 기준으로 올바르게 나뉜다', () => {
    expect(loyaltyTier(0)).toBe('newcomer');
    expect(loyaltyTier(LOYALTY_TRUSTED_SEASONS - 1)).toBe('newcomer');
    expect(loyaltyTier(LOYALTY_TRUSTED_SEASONS)).toBe('trusted');
    expect(loyaltyTier(LOYALTY_LEGEND_SEASONS - 1)).toBe('trusted');
    expect(loyaltyTier(LOYALTY_LEGEND_SEASONS)).toBe('legend');
    expect(loyaltyTier(99)).toBe('legend');
  });

  it('할인율은 trusted 문턱 미만이면 0이고, legend 문턱 이상이면 최대치다', () => {
    expect(loyaltyDiscount(0)).toBe(0);
    expect(loyaltyDiscount(LOYALTY_TRUSTED_SEASONS - 1)).toBe(0);
    expect(loyaltyDiscount(LOYALTY_LEGEND_SEASONS)).toBe(LOYALTY_MAX_DISCOUNT);
    expect(loyaltyDiscount(99)).toBe(LOYALTY_MAX_DISCOUNT);
  });

  it('할인율은 두 문턱 사이에서 선형으로 증가한다', () => {
    const mid = Math.floor((LOYALTY_TRUSTED_SEASONS + LOYALTY_LEGEND_SEASONS) / 2);
    const d = loyaltyDiscount(mid);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(LOYALTY_MAX_DISCOUNT);
  });

  it('오프시즌을 반복하면 이적 없이 남은 선수의 seasonsAtClub이 매 시즌 1씩 늘어난다', () => {
    const { clubs } = twoClubs(1);
    const me = clubs[0]!;
    const player = me.players[0]!;
    player.age = 20; // 은퇴 위험 없이 여러 오프시즌을 통과시키기 위함
    expect(player.seasonsAtClub ?? 0).toBe(0);

    runOffseason(clubs, new Rng(100));
    expect(player.seasonsAtClub).toBe(1);
    runOffseason(clubs, new Rng(101));
    expect(player.seasonsAtClub).toBe(2);
  });

  it('구단을 옮기면(판매) seasonsAtClub이 0으로 초기화된다', () => {
    const { clubs, myId } = twoClubs(2);
    const me = clubs.find((c) => c.id === myId)!;
    const player = me.players[0]!;
    player.age = 20;
    runOffseason(clubs, new Rng(102));
    runOffseason(clubs, new Rng(103));
    expect(player.seasonsAtClub).toBeGreaterThan(0);

    const offer = sellOffers(clubs, myId, player.id)[0]!;
    acceptSellOffer(clubs, myId, player.id, offer.clubId);
    expect(player.seasonsAtClub).toBe(0);
  });

  it('스와프로 이적해도 양쪽 선수 모두 seasonsAtClub이 초기화된다', () => {
    const { clubs, myId } = twoClubs(3);
    const me = clubs.find((c) => c.id === myId)!;
    const other = clubs.find((c) => c.id !== myId)!;
    const myPlayer = me.players[me.players.length - 1]!;
    const otherPlayer = other.players[other.players.length - 1]!;
    myPlayer.age = 20; otherPlayer.age = 20;
    runOffseason(clubs, new Rng(104));
    expect(myPlayer.seasonsAtClub).toBeGreaterThan(0);
    expect(otherPlayer.seasonsAtClub).toBeGreaterThan(0);

    swapPlayers(clubs, myId, other.id, myPlayer.id, otherPlayer.id);
    expect(myPlayer.seasonsAtClub).toBe(0);
    expect(otherPlayer.seasonsAtClub).toBe(0);
  });

  it('영입한 새 선수는 곧바로 로열티가 0에서 시작한다', () => {
    const { clubs, myId } = twoClubs(4);
    const other = clubs.find((c) => c.id !== myId)!;
    const player = other.players[0]!;
    player.seasonsAtClub = 5; // 상대 구단에서 오래 뛴 선수라도
    const ask = askingPrice(other, player);

    const r = buyPlayerAt(clubs, myId, player.id, ask);
    expect(r.ok).toBe(true);
    expect(player.seasonsAtClub).toBe(0);
  });

  it('임대 온 선수는 오프시즌을 지나도 로열티가 늘지 않는다(원 소속 몫)', () => {
    const { clubs, myId } = twoClubs(5);
    const me = clubs.find((c) => c.id === myId)!;
    const other = clubs.find((c) => c.id !== myId)!;
    const player = other.players[other.players.length - 1]!;
    player.age = 20;
    loanPlayerOut(clubs, other.id, myId, player.id, { seasons: 2, fee: 0, wageShareByParent: 0 });
    expect(me.players.some((p) => p.id === player.id)).toBe(true);

    runOffseason(clubs, new Rng(105));
    expect(player.seasonsAtClub ?? 0).toBe(0);
  });
});
