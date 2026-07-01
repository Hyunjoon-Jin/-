import { describe, it, expect } from 'vitest';
import { selectCallUps, runInternationalBreak } from '../src/international.js';
import { generateClub } from '../src/generate.js';
import { currentAbility } from '../src/derived.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function league(seed: number, tiers: number[]): Club[] {
  const rng = new Rng(seed);
  return tiers.map((t, i) => generateClub(rng, `c${i}`, `C${i}`, t));
}

describe('international: 국가대표 차출', () => {
  it('국적별 상위 선수만, 최소 능력 미만은 제외', () => {
    const clubs = league(1, [18, 17, 16, 15]);
    const called = selectCallUps(clubs, 23, 148);
    // 모두 최소 능력 이상
    for (const p of called) expect(currentAbility(p)).toBeGreaterThanOrEqual(148);
    // 국적별 23명 이하
    const byNat = new Map<string, number>();
    for (const p of called) byNat.set(p.nationality, (byNat.get(p.nationality) ?? 0) + 1);
    for (const n of byNat.values()) expect(n).toBeLessThanOrEqual(23);
  });

  it('차출 선수는 캡·사기가 오르고 컨디션이 낮아진다', () => {
    const clubs = league(2, [19, 18, 17, 16]);
    for (const c of clubs) for (const p of c.players) { p.condition = 1; p.morale = 0.5; }
    const before = new Map(clubs.flatMap((c) => c.players).map((p) => [p.id, p.caps]));

    const res = runInternationalBreak(clubs, new Rng(5));
    expect(res.callUps.length).toBeGreaterThan(0);

    for (const cu of res.callUps) {
      const p = clubs.flatMap((c) => c.players).find((x) => x.id === cu.playerId)!;
      expect(p.caps).toBe((before.get(p.id) ?? 0) + 1);
      expect(p.morale).toBeGreaterThan(0.5);
      expect(p.condition).toBeLessThanOrEqual(0.9);
    }
  });

  it('차출되지 않은 선수는 그대로', () => {
    const clubs = league(3, [8, 8]); // 약체 리그 → 차출 대상 거의 없음
    for (const c of clubs) for (const p of c.players) { p.condition = 1; p.caps = 0; }
    const res = runInternationalBreak(clubs, new Rng(9));
    const calledIds = new Set(res.callUps.map((c) => c.playerId));
    for (const p of clubs.flatMap((c) => c.players)) {
      if (!calledIds.has(p.id)) {
        expect(p.caps).toBe(0);
        expect(p.condition).toBe(1);
      }
    }
  });

  it('동일 시드면 동일 결과 (재현성)', () => {
    const a = league(7, [18, 17, 16]);
    const b = league(7, [18, 17, 16]);
    const ra = runInternationalBreak(a, new Rng(4));
    const rb = runInternationalBreak(b, new Rng(4));
    expect(ra.callUps.map((c) => c.playerId)).toEqual(rb.callUps.map((c) => c.playerId));
    expect(ra.injuries).toBe(rb.injuries);
  });
});
