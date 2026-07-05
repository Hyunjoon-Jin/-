import { describe, it, expect } from 'vitest';
import { scoutDispatchCost, dispatchScout } from '../src/scouting.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function makeClub(seed = 1, tier = 12) {
  const rng = new Rng(seed);
  return generateClub(rng, 'c', 'C', tier);
}

describe('B13: 스카우트 파견', () => {
  it('스카우팅 레벨이 높을수록 파견 비용이 저렴하다', () => {
    expect(scoutDispatchCost(0)).toBeGreaterThan(scoutDispatchCost(10));
    expect(scoutDispatchCost(10)).toBeGreaterThan(scoutDispatchCost(20));
  });

  it('비용은 최소치 아래로 내려가지 않는다', () => {
    expect(scoutDispatchCost(100)).toBeGreaterThanOrEqual(50);
  });

  it('자금이 충분하면 파견에 성공하고 비용이 차감되며 선수 id가 등록된다', () => {
    const club = makeClub(1);
    club.finance.balance = 10_000_000;
    const before = club.finance.balance;
    const cost = scoutDispatchCost(club.staff.scouting);
    const r = dispatchScout(club, 'target-1');
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(cost);
    expect(club.finance.balance).toBe(before - cost);
    expect(club.scoutedPlayerIds).toContain('target-1');
  });

  it('자금이 부족하면 거절되고 상태가 변하지 않는다', () => {
    const club = makeClub(2);
    club.finance.balance = 0;
    const r = dispatchScout(club, 'target-2');
    expect(r.ok).toBe(false);
    expect(club.scoutedPlayerIds ?? []).not.toContain('target-2');
  });

  it('이미 파견을 마친 선수는 다시 파견할 수 없다(중복 과금 방지)', () => {
    const club = makeClub(3);
    club.finance.balance = 10_000_000;
    const first = dispatchScout(club, 'target-3');
    expect(first.ok).toBe(true);
    const balanceAfterFirst = club.finance.balance;
    const second = dispatchScout(club, 'target-3');
    expect(second.ok).toBe(false);
    expect(club.finance.balance).toBe(balanceAfterFirst); // 추가 과금 없음
  });

  it('여러 선수를 파견하면 각각 독립적으로 등록된다', () => {
    const club = makeClub(4);
    club.finance.balance = 10_000_000;
    dispatchScout(club, 'a');
    dispatchScout(club, 'b');
    expect(club.scoutedPlayerIds).toEqual(expect.arrayContaining(['a', 'b']));
    expect(club.scoutedPlayerIds).toHaveLength(2);
  });
});
