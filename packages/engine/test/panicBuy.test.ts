import { describe, it, expect } from 'vitest';
import {
  panicBuy, askingPrice, PANIC_BUY_PREMIUM, agentRelationsOf, evaluateOffer,
} from '../src/transferActions.js';
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

function pickPlayer(other: Club) {
  return other.players[Math.floor(other.players.length / 2)]!;
}

describe('신규 개선 항목 7: 이적 마감시한 패닉 바이(D-day 프리미엄)', () => {
  it('호가의 PANIC_BUY_PREMIUM배를 지불하고 협상 없이 즉시 영입된다', () => {
    const { clubs, myId } = twoClubs(1);
    const other = clubs[1]!;
    const player = pickPlayer(other);
    const ask = askingPrice(other, player);
    const expectedFee = Math.round(ask * PANIC_BUY_PREMIUM);

    const r = panicBuy(clubs, myId, player.id);
    expect(r.ok).toBe(true);
    expect(r.fee).toBe(expectedFee);
    expect(clubs[0]!.players.some((p) => p.id === player.id)).toBe(true);
    expect(other.players.some((p) => p.id === player.id)).toBe(false);
  });

  it('일반 협상이라면 거절됐을 헐값 이하 상황에서도, 애초에 프리미엄이 붙어 있어 항상 호가 이상을 지불한다', () => {
    const { clubs, myId } = twoClubs(2);
    const other = clubs[1]!;
    const player = pickPlayer(other);
    const ask = askingPrice(other, player);

    const r = panicBuy(clubs, myId, player.id);
    expect(r.ok).toBe(true);
    expect(r.fee!).toBeGreaterThan(ask);
  });

  it('예산이 부족하면 패닉 바이도 거절된다', () => {
    const { clubs, myId } = twoClubs(3);
    const me = clubs[0]!;
    const other = clubs[1]!;
    const player = pickPlayer(other);
    me.finance.transferBudget = 1;
    me.finance.balance = 1;

    const r = panicBuy(clubs, myId, player.id);
    expect(r.ok).toBe(false);
  });

  it('buyPlayerAt을 재사용하므로 성공 시 관계 지수도 함께 오른다(Item6 연동)', () => {
    const { clubs, myId } = twoClubs(4);
    const me = clubs[0]!;
    const other = clubs[1]!;
    const player = pickPlayer(other);
    const before = agentRelationsOf(me, other.id);

    const r = panicBuy(clubs, myId, player.id);
    expect(r.ok).toBe(true);
    expect(agentRelationsOf(me, other.id)).toBeGreaterThan(before);
  });

  it('일반 협상(evaluateOffer)과 달리 라운드·역제안 없이 항상 한 번에 확정된다', () => {
    const { clubs, myId } = twoClubs(5);
    const other = clubs[1]!;
    const player = pickPlayer(other);
    // 낮은 제안은 evaluateOffer라면 거절/역제안이겠지만, panicBuy는 애초에 낮은 제안이라는
    // 개념 자체가 없다(항상 호가+프리미엄 고정가) — 존재 확인 차원에서 evaluateOffer와 별개 경로임만 검증.
    const lowOffer = evaluateOffer(clubs, myId, player.id, 1);
    expect(lowOffer.outcome).not.toBe('accepted');

    const r = panicBuy(clubs, myId, player.id);
    expect(r.ok).toBe(true);
  });
});
