import { describe, it, expect } from 'vitest';
import {
  askingPrice, evaluateOffer, buyPlayerAt, transferTargets,
} from '../src/transferActions.js';
import { generateClub } from '../src/generate.js';
import { marketValue } from '../src/valuation.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function twoClubs(seed = 1): { clubs: Club[]; myId: string } {
  const rng = new Rng(seed);
  const me = generateClub(rng, 'me', 'Me', 14);
  const other = generateClub(rng, 'ot', 'Other', 14);
  // 넉넉한 예산 보장
  me.finance.transferBudget = 500_000_000;
  return { clubs: [me, other], myId: 'me' };
}

function aTarget(clubs: Club[], myId: string) {
  return transferTargets(clubs, myId)[0]!;
}

describe('negotiation: 이적 협상', () => {
  it('호가는 시장가 이상(핵심 선수는 프리미엄)', () => {
    const { clubs, myId } = twoClubs(2);
    const seller = clubs.find((c) => c.id !== myId)!;
    // 그 라인 최고 선수 = 핵심 → 프리미엄
    const line = seller.players.slice().sort((a, b) => marketValue(b) - marketValue(a));
    const star = line[0]!;
    const ask = askingPrice(seller, star);
    expect(ask).toBeGreaterThanOrEqual(marketValue(star));
  });

  it('호가 이상 제안은 수락', () => {
    const { clubs, myId } = twoClubs(3);
    const t = aTarget(clubs, myId);
    const seller = clubs.find((c) => c.id !== myId)!;
    const ask = askingPrice(seller, t.player);
    const ev = evaluateOffer(clubs, myId, t.player.id, ask);
    expect(ev.ok).toBe(true);
    expect(ev.outcome).toBe('accepted');
    expect(ev.asking).toBe(ask);
  });

  it('하한~호가 사이는 역제안(제안<역제안≤호가)', () => {
    const { clubs, myId } = twoClubs(4);
    const t = aTarget(clubs, myId);
    const seller = clubs.find((c) => c.id !== myId)!;
    const ask = askingPrice(seller, t.player);
    const offer = Math.round(ask * 0.9); // 하한(0.82)~호가 사이
    const ev = evaluateOffer(clubs, myId, t.player.id, offer);
    expect(ev.outcome).toBe('countered');
    expect(ev.counter!).toBeGreaterThan(offer);
    expect(ev.counter!).toBeLessThanOrEqual(ask);
  });

  it('하한 미만은 거절', () => {
    const { clubs, myId } = twoClubs(5);
    const t = aTarget(clubs, myId);
    const seller = clubs.find((c) => c.id !== myId)!;
    const ask = askingPrice(seller, t.player);
    const ev = evaluateOffer(clubs, myId, t.player.id, Math.round(ask * 0.5));
    expect(ev.outcome).toBe('rejected');
  });

  it('예산 초과 제안은 협상 불가', () => {
    const { clubs, myId } = twoClubs(6);
    const t = aTarget(clubs, myId);
    const me = clubs.find((c) => c.id === myId)!;
    me.finance.transferBudget = 1;
    const ev = evaluateOffer(clubs, myId, t.player.id, 100_000);
    expect(ev.ok).toBe(false);
  });

  it('buyPlayerAt: 합의액으로 영입, 양 구단 예산·스쿼드 이동', () => {
    const { clubs, myId } = twoClubs(7);
    const t = aTarget(clubs, myId);
    const me = clubs.find((c) => c.id === myId)!;
    const seller = clubs.find((c) => c.id !== myId)!;
    const beforeMe = me.players.length, beforeSeller = seller.players.length;
    const budgetBefore = me.finance.transferBudget;
    const fee = askingPrice(seller, t.player);

    const r = buyPlayerAt(clubs, myId, t.player.id, fee);
    expect(r.ok).toBe(true);
    expect(r.fee).toBe(fee);
    expect(me.players.length).toBe(beforeMe + 1);
    expect(seller.players.length).toBe(beforeSeller - 1);
    expect(me.finance.transferBudget).toBe(budgetBefore - fee);
    expect(me.players.some((p) => p.id === t.player.id)).toBe(true);
  });
});
