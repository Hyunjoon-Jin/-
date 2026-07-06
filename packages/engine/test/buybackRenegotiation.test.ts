import { describe, it, expect } from 'vitest';
import {
  sellOffers, acceptSellOffer, renegotiateBuybackClause,
  BUYBACK_RENEGOTIATION_STEP, BUYBACK_VALUE_INCREASE_RATIO, BUYBACK_VALUE_DECREASE_RATIO,
} from '../src/transferActions.js';
import { marketValue } from '../src/valuation.js';
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

function sellWithBuyback(clubs: Club[], myId: string, fee: number) {
  const me = clubs.find((c) => c.id === myId)!;
  const player = me.players[0]!;
  const offer = sellOffers(clubs, myId, player.id)[0]!;
  acceptSellOffer(clubs, myId, player.id, offer.clubId, Math.max(fee, offer.bid));
  player.buybackClause = { clubId: myId, fee, seasonsRemaining: 2 };
  return player;
}

describe('고도화 Item5: 바이백 조항 협상형 재구성', () => {
  it('선수 가치가 조항 금액보다 충분히 오르면 현재 구단의 인상 요청이 성사된다', () => {
    const { clubs, myId } = league(1);
    const player = sellWithBuyback(clubs, myId, 1);
    const value = marketValue(player);
    player.buybackClause!.fee = Math.round(value / (BUYBACK_VALUE_INCREASE_RATIO + 0.1));

    const r = renegotiateBuybackClause(clubs, player.id, 'increase');
    expect(r.ok).toBe(true);
    expect(player.buybackClause!.fee).toBe(r.newFee);
  });

  it('선수 가치가 충분히 오르지 않으면 인상 요청이 거절된다', () => {
    const { clubs, myId } = league(2);
    const player = sellWithBuyback(clubs, myId, 1);
    const value = marketValue(player);
    player.buybackClause!.fee = Math.round(value); // 시가와 동일 — 인상 조건(1.3배) 미달

    const r = renegotiateBuybackClause(clubs, player.id, 'increase');
    expect(r.ok).toBe(false);
    expect(player.buybackClause!.fee).toBe(Math.round(value));
  });

  it('선수 가치가 조항 금액보다 충분히 떨어지면 원 소속 구단의 인하 요청이 성사된다', () => {
    const { clubs, myId } = league(3);
    const player = sellWithBuyback(clubs, myId, 1);
    const value = marketValue(player);
    player.buybackClause!.fee = Math.round(value / (BUYBACK_VALUE_DECREASE_RATIO - 0.1));

    const r = renegotiateBuybackClause(clubs, player.id, 'decrease');
    expect(r.ok).toBe(true);
    expect(player.buybackClause!.fee).toBe(r.newFee);
    expect(r.newFee!).toBeLessThan(Math.round(value / (BUYBACK_VALUE_DECREASE_RATIO - 0.1)));
  });

  it('선수 가치가 충분히 떨어지지 않으면 인하 요청이 거절된다', () => {
    const { clubs, myId } = league(4);
    const player = sellWithBuyback(clubs, myId, 1);
    const value = marketValue(player);
    player.buybackClause!.fee = Math.round(value); // 시가와 동일 — 인하 조건(0.7배 이하) 미달

    const r = renegotiateBuybackClause(clubs, player.id, 'decrease');
    expect(r.ok).toBe(false);
  });

  it('한 시즌에 한 번만 재협상을 시도할 수 있다(성사 여부와 무관)', () => {
    const { clubs, myId } = league(5);
    const player = sellWithBuyback(clubs, myId, 1);
    const value = marketValue(player);
    player.buybackClause!.fee = Math.round(value); // 어느 방향도 거절될 상황

    const r1 = renegotiateBuybackClause(clubs, player.id, 'increase');
    expect(r1.ok).toBe(false);
    const r2 = renegotiateBuybackClause(clubs, player.id, 'decrease');
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain('이미 바이백 조항 재협상을 시도');
  });

  it('바이백 조항이 없는 선수는 재협상할 수 없다', () => {
    const { clubs, myId } = league(6);
    const player = clubs.find((c) => c.id === myId)!.players[0]!;
    const r = renegotiateBuybackClause(clubs, player.id, 'increase');
    expect(r.ok).toBe(false);
  });

  it('시즌이 넘어가고 조항이 계속 유효하면 재협상 시도 플래그가 초기화된다', () => {
    const { clubs, myId } = league(7);
    const player = sellWithBuyback(clubs, myId, 1);
    player.age = 20;
    const value = marketValue(player);
    player.buybackClause!.fee = Math.round(value / (BUYBACK_VALUE_INCREASE_RATIO + 0.1));

    renegotiateBuybackClause(clubs, player.id, 'increase');
    expect(player.buybackRenegotiatedThisSeason).toBe(true);

    runOffseason(clubs, new Rng(400));
    expect(player.buybackClause).toBeDefined(); // 아직 유효기간 남음
    expect(player.buybackRenegotiatedThisSeason).toBe(false);
  });
});
