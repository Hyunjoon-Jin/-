import { describe, it, expect } from 'vitest';
import { attachAddOnClause, addOnConditionValue, ADD_ON_MAX_TIERS } from '../src/transferActions.js';
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

describe('신규 개선 항목 3 → 고도화 항목4: 성과 기반 후불 이적료(Add-on) 다단계화', () => {
  it('티어가 하나도 없으면 거절된다', () => {
    const { seller, buyer } = twoClubs(1);
    const player = buyer.players[0]!;
    const r = attachAddOnClause([seller, buyer], player.id, seller.id, []);
    expect(r.ok).toBe(false);
  });

  it('티어 기준이나 금액이 0 이하면 거절된다', () => {
    const { seller, buyer } = twoClubs(2);
    const player = buyer.players[0]!;
    const r = attachAddOnClause([seller, buyer], player.id, seller.id, [{ kind: 'appearances', threshold: 10, fee: 0 }]);
    expect(r.ok).toBe(false);
  });

  it('티어는 최대 개수를 초과할 수 없다', () => {
    const { seller, buyer } = twoClubs(3);
    const player = buyer.players[0]!;
    const tiers = Array.from({ length: ADD_ON_MAX_TIERS + 1 }, (_, i) => (
      { kind: 'goals' as const, threshold: (i + 1) * 5, fee: 10000 }
    ));
    const r = attachAddOnClause([seller, buyer], player.id, seller.id, tiers);
    expect(r.ok).toBe(false);
  });

  it('조항을 붙이면 player.addOnClause에 티어 그대로 반영된다', () => {
    const { seller, buyer } = twoClubs(4);
    const player = buyer.players[0]!;
    const tiers = [{ kind: 'appearances' as const, threshold: 10, fee: 30000 }];
    const r = attachAddOnClause([seller, buyer], player.id, seller.id, tiers);
    expect(r.ok).toBe(true);
    expect(player.addOnClause).toEqual({ sellerClubId: seller.id, tiers });
  });

  it('단일 티어 조건을 충족하면 오프시즌에 지급되고 조항이 완전히 사라진다', () => {
    const { seller, buyer } = twoClubs(5);
    const player = buyer.players[0]!;
    player.age = 20;
    player.seasonApps = 15;
    attachAddOnClause([seller, buyer], player.id, seller.id, [{ kind: 'appearances', threshold: 10, fee: 30000 }]);
    const sellerBalBefore = seller.finance.balance;
    const buyerBalBefore = buyer.finance.balance;

    const result = runOffseason([seller, buyer], new Rng(99));
    expect(seller.finance.balance).toBe(sellerBalBefore + 30000);
    expect(buyer.finance.balance).toBe(buyerBalBefore - 30000);
    expect(player.addOnClause).toBeUndefined();
    expect(result.addOnPayouts).toHaveLength(1);
    expect(result.addOnPayouts[0]).toMatchObject({
      playerId: player.id, fromClubId: buyer.id, toClubId: seller.id, fee: 30000,
      tierKind: 'appearances', tierThreshold: 10,
    });
  });

  it('다단계 티어 중 낮은 단계만 충족하면 그 몫만 지급되고 남은 티어는 유지된다', () => {
    const { seller, buyer } = twoClubs(6);
    const player = buyer.players[0]!;
    player.age = 20;
    player.seasonGoals = 12; // 10골 티어만 충족, 20골 티어는 미달
    attachAddOnClause([seller, buyer], player.id, seller.id, [
      { kind: 'goals', threshold: 10, fee: 20000 },
      { kind: 'goals', threshold: 20, fee: 50000 },
    ]);
    const sellerBalBefore = seller.finance.balance;

    const result = runOffseason([seller, buyer], new Rng(100));
    expect(seller.finance.balance).toBe(sellerBalBefore + 20000);
    expect(result.addOnPayouts).toHaveLength(1);
    expect(result.addOnPayouts[0]).toMatchObject({ fee: 20000, tierKind: 'goals', tierThreshold: 10 });
    expect(player.addOnClause).toBeDefined();
    expect(player.addOnClause!.tiers).toHaveLength(2);
    expect(player.addOnClause!.paidTierIndexes).toEqual([0]);
  });

  it('이미 지급된 티어는 다음 시즌에 다시 지급되지 않는다', () => {
    const { seller, buyer } = twoClubs(7);
    const player = buyer.players[0]!;
    player.age = 20;
    player.seasonGoals = 12;
    attachAddOnClause([seller, buyer], player.id, seller.id, [
      { kind: 'goals', threshold: 10, fee: 20000 },
      { kind: 'goals', threshold: 20, fee: 50000 },
    ]);
    runOffseason([seller, buyer], new Rng(101)); // 10골 티어 지급, seasonGoals는 0으로 리셋됨

    player.seasonGoals = 25; // 다음 시즌에도 계속 잘함 — 20골 티어까지 충족
    const sellerBalBefore = seller.finance.balance;
    const result = runOffseason([seller, buyer], new Rng(102));
    expect(seller.finance.balance).toBe(sellerBalBefore + 50000);
    expect(result.addOnPayouts).toHaveLength(1);
    expect(result.addOnPayouts[0]).toMatchObject({ fee: 50000, tierKind: 'goals', tierThreshold: 20 });
    expect(player.addOnClause).toBeUndefined(); // 두 티어 모두 소진 → 조항 소멸
  });

  it('도움·클린시트 조건도 시즌 누적치로 판정된다', () => {
    const { seller, buyer } = twoClubs(8);
    const player = buyer.players[0]!;
    player.age = 20;
    player.seasonAssists = 10;
    player.seasonCleanSheets = 5;
    attachAddOnClause([seller, buyer], player.id, seller.id, [
      { kind: 'assists', threshold: 8, fee: 15000 },
      { kind: 'cleanSheets', threshold: 10, fee: 25000 },
    ]);
    const result = runOffseason([seller, buyer], new Rng(103));
    expect(result.addOnPayouts).toHaveLength(1);
    expect(result.addOnPayouts[0]).toMatchObject({ fee: 15000, tierKind: 'assists' });
    expect(player.addOnClause).toBeDefined(); // 클린시트 티어는 미달이라 유지
  });

  it('addOnConditionValue는 각 조건 종류에 맞는 시즌 누적치를 반환한다', () => {
    const { buyer } = twoClubs(9);
    const player = buyer.players[0]!;
    player.seasonApps = 3; player.seasonGoals = 4; player.seasonAssists = 5; player.seasonCleanSheets = 6;
    expect(addOnConditionValue(player, 'appearances')).toBe(3);
    expect(addOnConditionValue(player, 'goals')).toBe(4);
    expect(addOnConditionValue(player, 'assists')).toBe(5);
    expect(addOnConditionValue(player, 'cleanSheets')).toBe(6);
  });

  it('조건에 도달하지 못하면 발동하지 않고 조항이 그대로 유지된다', () => {
    const { seller, buyer } = twoClubs(10);
    const player = buyer.players[0]!;
    player.age = 20;
    player.seasonApps = 2;
    player.seasonGoals = 0;
    attachAddOnClause([seller, buyer], player.id, seller.id, [{ kind: 'appearances', threshold: 20, fee: 20000 }]);
    const result = runOffseason([seller, buyer], new Rng(104));
    expect(result.addOnPayouts).toHaveLength(0);
    expect(player.addOnClause).toBeDefined();
  });

  it('같은 구단에는 조항을 붙일 수 없다', () => {
    const { buyer } = twoClubs(11);
    const player = buyer.players[0]!;
    const r = attachAddOnClause([buyer], player.id, buyer.id, [{ kind: 'appearances', threshold: 10, fee: 10000 }]);
    expect(r.ok).toBe(false);
  });
});
