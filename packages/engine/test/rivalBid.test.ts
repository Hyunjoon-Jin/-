import { describe, it, expect } from 'vitest';
import { askingPrice, evaluateOffer, executeRivalSnipe } from '../src/transferActions.js';
import { hashSeed } from '../src/math.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function makeLeague(seed: number, n = 6): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < n; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 8 + i));
  for (const c of clubs) { c.finance.transferBudget = 500_000_000; c.finance.balance = 500_000_000; }
  return clubs;
}

/** transferActions.ts와 동일한 공식으로 라운드별 경쟁 입찰 발동 확률을 계산한다(테스트 전용 사본). */
function rivalChanceAt(round: number): number {
  const RIVAL_BID_MIN_ROUND = 1;
  const RIVAL_BID_BASE_CHANCE = 0.12;
  const RIVAL_BID_PER_ROUND = 0.06;
  const RIVAL_BID_MAX_CHANCE = 0.35;
  return Math.min(RIVAL_BID_MAX_CHANCE, RIVAL_BID_BASE_CHANCE + (round - RIVAL_BID_MIN_ROUND) * RIVAL_BID_PER_ROUND);
}

/** hashSeed 롤이 실제로 chance 아래로 떨어지는 (선수, 라운드) 조합을 총당해 찾는다. */
function findTriggeringCase(clubs: Club[], myId: string, round: number): { playerId: string } | undefined {
  const chance = rivalChanceAt(round);
  for (const club of clubs) {
    if (club.id === myId) continue;
    for (const player of club.players) {
      const roll = hashSeed(`${player.id}:${round}:rival`) / 0xFFFFFFFF;
      if (roll < chance) return { playerId: player.id };
    }
  }
  return undefined;
}

describe('신규 개선 항목 9: 경쟁 입찰(라이벌 클럽 개입)', () => {
  it('0라운드(첫 제안)에서는 절대 경쟁 입찰이 발동하지 않는다', () => {
    const clubs = makeLeague(1);
    const other = clubs.find((c) => c.id !== 'c0')!;
    for (const player of other.players) {
      const ask = askingPrice(other, player);
      const r = evaluateOffer(clubs, 'c0', player.id, Math.round(ask * 0.5), 0);
      expect(r.outcome).not.toBe('lostToRival');
    }
  });

  it('충분히 낮은 라운드 이후 헐값 제안이면 결정론적으로 경쟁 입찰에 밀린다', () => {
    const clubs = makeLeague(2);
    const found = findTriggeringCase(clubs, 'c0', 3);
    expect(found).toBeDefined();
    const seller = clubs.find((c) => c.players.some((p) => p.id === found!.playerId))!;
    const player = seller.players.find((p) => p.id === found!.playerId)!;
    const ask = askingPrice(seller, player);

    const r = evaluateOffer(clubs, 'c0', player.id, Math.round(ask * 0.5), 3);
    expect(r.outcome).toBe('lostToRival');
    expect(r.rivalClubId).toBeDefined();
    expect(r.rivalBid).toBeGreaterThan(0);
  });

  it('제안액이 라이벌 입찰액 이상이면 같은 상황에서도 안전하다', () => {
    const clubs = makeLeague(2);
    const found = findTriggeringCase(clubs, 'c0', 3);
    expect(found).toBeDefined();
    const seller = clubs.find((c) => c.players.some((p) => p.id === found!.playerId))!;
    const player = seller.players.find((p) => p.id === found!.playerId)!;
    const ask = askingPrice(seller, player);

    // 넉넉히 asking의 1.3배로 제안하면 라이벌 입찰액(최대 asking*1.14)보다 항상 높다.
    const r = evaluateOffer(clubs, 'c0', player.id, Math.round(ask * 1.3), 3);
    expect(r.outcome).not.toBe('lostToRival');
  });

  it('executeRivalSnipe를 호출하면 실제로 선수가 라이벌 구단으로 이적한다', () => {
    const clubs = makeLeague(3);
    const found = findTriggeringCase(clubs, 'c0', 3);
    expect(found).toBeDefined();
    const seller = clubs.find((c) => c.players.some((p) => p.id === found!.playerId))!;
    const player = seller.players.find((p) => p.id === found!.playerId)!;
    const ask = askingPrice(seller, player);
    const r = evaluateOffer(clubs, 'c0', player.id, Math.round(ask * 0.5), 3);
    expect(r.outcome).toBe('lostToRival');
    const rivalId = r.rivalClubId!;
    const bid = r.rivalBid!;
    const rival = clubs.find((c) => c.id === rivalId)!;
    const sellerBalBefore = seller.finance.balance;
    const rivalBalBefore = rival.finance.balance;

    const snipe = executeRivalSnipe(clubs, rivalId, player.id, bid);
    expect(snipe.ok).toBe(true);
    expect(rival.players.some((p) => p.id === player.id)).toBe(true);
    expect(seller.players.some((p) => p.id === player.id)).toBe(false);
    expect(seller.finance.balance).toBe(sellerBalBefore + bid);
    expect(rival.finance.balance).toBe(rivalBalBefore - bid);
  });

  it('라이벌 구단이 존재하지 않으면 executeRivalSnipe가 거절된다', () => {
    const clubs = makeLeague(4);
    const other = clubs.find((c) => c.id !== 'c0')!;
    const player = other.players[0]!;
    const r = executeRivalSnipe(clubs, 'nonexistent', player.id, 1000);
    expect(r.ok).toBe(false);
  });
});
