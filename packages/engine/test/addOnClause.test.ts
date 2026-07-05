import { describe, it, expect } from 'vitest';
import { attachAddOnClause } from '../src/transferActions.js';
import { runOffseason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function twoClubs(seed = 1): { seller: Club; buyer: Club } {
  const rng = new Rng(seed);
  const seller = generateClub(rng, 'seller', 'Seller', 12);
  const buyer = generateClub(rng, 'buyer', 'Buyer', 12);
  return { seller, buyer };
}

describe('신규 개선 항목 3: 성과 기반 후불 이적료(Add-on)', () => {
  it('출전 또는 득점 조건 중 하나는 있어야 한다', () => {
    const { seller, buyer } = twoClubs(1);
    const player = buyer.players[0]!;
    const r = attachAddOnClause([seller, buyer], player.id, seller.id, undefined, undefined, 10000);
    expect(r.ok).toBe(false);
  });

  it('금액이 0 이하면 거절된다', () => {
    const { seller, buyer } = twoClubs(2);
    const player = buyer.players[0]!;
    const r = attachAddOnClause([seller, buyer], player.id, seller.id, 10, undefined, 0);
    expect(r.ok).toBe(false);
  });

  it('조항을 붙이면 player.addOnClause에 반영된다', () => {
    const { seller, buyer } = twoClubs(3);
    const player = buyer.players[0]!;
    const r = attachAddOnClause([seller, buyer], player.id, seller.id, 10, 5, 30000);
    expect(r.ok).toBe(true);
    expect(player.addOnClause).toEqual({ sellerClubId: seller.id, appearances: 10, goals: 5, fee: 30000 });
  });

  it('출전 조건을 이번 시즌 충족하면 오프시즌에 원 소속 구단으로 지급되고 조항이 사라진다', () => {
    const { seller, buyer } = twoClubs(4);
    const player = buyer.players[0]!;
    player.age = 20;
    player.seasonApps = 15;
    attachAddOnClause([seller, buyer], player.id, seller.id, 10, undefined, 30000);
    const sellerBalBefore = seller.finance.balance;
    const buyerBalBefore = buyer.finance.balance;

    const result = runOffseason([seller, buyer], new Rng(99));
    expect(seller.finance.balance).toBe(sellerBalBefore + 30000);
    expect(buyer.finance.balance).toBe(buyerBalBefore - 30000);
    expect(player.addOnClause).toBeUndefined();
    expect(result.addOnPayouts).toHaveLength(1);
    expect(result.addOnPayouts[0]).toMatchObject({
      playerId: player.id, fromClubId: buyer.id, toClubId: seller.id, fee: 30000,
    });
  });

  it('득점 조건을 충족하면(출전 조건 미달이어도) 지급된다', () => {
    const { seller, buyer } = twoClubs(5);
    const player = buyer.players[0]!;
    player.age = 20;
    player.seasonApps = 0;
    player.seasonGoals = 8;
    attachAddOnClause([seller, buyer], player.id, seller.id, 30, 5, 20000);
    const result = runOffseason([seller, buyer], new Rng(100));
    expect(result.addOnPayouts).toHaveLength(1);
  });

  it('조건에 도달하지 못하면 발동하지 않고 조항이 유지된다', () => {
    const { seller, buyer } = twoClubs(6);
    const player = buyer.players[0]!;
    player.age = 20;
    player.seasonApps = 2;
    player.seasonGoals = 0;
    attachAddOnClause([seller, buyer], player.id, seller.id, 20, 10, 20000);
    const result = runOffseason([seller, buyer], new Rng(101));
    expect(result.addOnPayouts).toHaveLength(0);
    expect(player.addOnClause).toBeDefined();
  });

  it('같은 구단에는 조항을 붙일 수 없다', () => {
    const { buyer } = twoClubs(7);
    const player = buyer.players[0]!;
    const r = attachAddOnClause([buyer], player.id, buyer.id, 10, undefined, 10000);
    expect(r.ok).toBe(false);
  });
});
