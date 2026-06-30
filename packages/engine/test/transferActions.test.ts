import { describe, it, expect } from 'vitest';
import {
  transferTargets, buyPlayer, sellPlayer, releasePlayer, MIN_SQUAD,
} from '../src/transferActions.js';
import { marketValue } from '../src/valuation.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function makeLeague(seed = 1): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < 6; i++) {
    const tier = 8 + Math.round((i / 5) * 8);
    clubs.push(generateClub(rng, `c${i}`, `C${i}`, tier));
  }
  return clubs;
}

describe('transferActions: 영입', () => {
  it('타 구단 선수만 매물에 오른다', () => {
    const clubs = makeLeague();
    const targets = transferTargets(clubs, 'c0');
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((t) => t.clubId !== 'c0')).toBe(true);
  });

  it('영입 시 선수 이동·예산 차감·매도 구단 입금이 일관된다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    // 예산 내 매물 하나 고르기
    const target = transferTargets(clubs, 'c0')
      .filter((t) => t.value <= me.finance.transferBudget)
      .sort((a, b) => a.value - b.value)[0]!;
    const seller = clubs.find((c) => c.id === target.clubId)!;
    const myBudget = me.finance.transferBudget;
    const sellerBal = seller.finance.balance;
    const mySize = me.players.length;
    const sellerSize = seller.players.length;

    const r = buyPlayer(clubs, 'c0', target.player.id);
    expect(r.ok).toBe(true);
    expect(me.finance.transferBudget).toBe(myBudget - r.fee!);
    expect(seller.finance.balance).toBe(sellerBal + r.fee!);
    expect(me.players.length).toBe(mySize + 1);
    expect(seller.players.length).toBe(sellerSize - 1);
    expect(me.players.some((p) => p.id === target.player.id)).toBe(true);
  });

  it('예산을 초과하면 영입에 실패한다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    me.finance.transferBudget = 0;
    const target = transferTargets(clubs, 'c0')[0]!;
    const r = buyPlayer(clubs, 'c0', target.player.id);
    expect(r.ok).toBe(false);
  });
});

describe('transferActions: 판매/방출', () => {
  it('판매 시 내 구단에 입금되고 선수가 빠진다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    const player = me.players[0]!;
    const balBefore = me.finance.balance;
    const sizeBefore = me.players.length;

    const r = sellPlayer(clubs, 'c0', player.id);
    expect(r.ok).toBe(true);
    expect(me.finance.balance).toBe(balBefore + r.fee!);
    expect(me.players.length).toBe(sizeBefore - 1);
    expect(me.players.some((p) => p.id === player.id)).toBe(false);
    // 판매가는 시장가의 92% (할인)
    expect(r.fee!).toBeLessThanOrEqual(marketValue(player));
  });

  it('전체 선수 수는 판매 전후로 보존된다(다른 구단이 영입)', () => {
    const clubs = makeLeague();
    const before = clubs.reduce((s, c) => s + c.players.length, 0);
    sellPlayer(clubs, 'c0', clubs[0]!.players[0]!.id);
    const after = clubs.reduce((s, c) => s + c.players.length, 0);
    expect(after).toBe(before);
  });

  it('방출은 수입 없이 선수를 내보낸다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    const player = me.players[0]!;
    const balBefore = me.finance.balance;
    const r = releasePlayer(clubs, 'c0', player.id);
    expect(r.ok).toBe(true);
    expect(me.finance.balance).toBe(balBefore); // 수입 없음
    expect(me.players.some((p) => p.id === player.id)).toBe(false);
  });

  it('최소 스쿼드 인원 이하로는 판매/방출할 수 없다', () => {
    const clubs = makeLeague();
    const me = clubs.find((c) => c.id === 'c0')!;
    // MIN_SQUAD까지 방출
    while (me.players.length > MIN_SQUAD) {
      releasePlayer(clubs, 'c0', me.players[me.players.length - 1]!.id);
    }
    const r = releasePlayer(clubs, 'c0', me.players[0]!.id);
    expect(r.ok).toBe(false);
    const s = sellPlayer(clubs, 'c0', me.players[0]!.id);
    expect(s.ok).toBe(false);
  });
});
