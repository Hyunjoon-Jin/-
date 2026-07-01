import { describe, it, expect } from 'vitest';
import { applyPromotionRelegation, clubsInDivision } from '../src/promotion.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function makeTwoDivisions(): Club[] {
  const rng = new Rng(1);
  const clubs: Club[] = [];
  for (let i = 0; i < 6; i++) clubs.push(generateClub(rng, `a${i}`, `D1-${i}`, 14, 0));
  for (let i = 0; i < 6; i++) clubs.push(generateClub(rng, `b${i}`, `D2-${i}`, 10, 1));
  return clubs;
}

describe('promotion: 승강제', () => {
  it('부별로 구단을 필터한다', () => {
    const clubs = makeTwoDivisions();
    expect(clubsInDivision(clubs, 0)).toHaveLength(6);
    expect(clubsInDivision(clubs, 1)).toHaveLength(6);
  });

  it('1부 하위 3팀 강등, 2부 상위 3팀 승격', () => {
    const clubs = makeTwoDivisions();
    // 가상 순위표: d1 = a0..a5, d2 = b0..b5
    const d1Table = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'].map((clubId) => ({ clubId }));
    const d2Table = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5'].map((clubId) => ({ clubId }));
    const r = applyPromotionRelegation(clubs, d1Table, d2Table, 3);
    expect(r.relegated).toEqual(['a3', 'a4', 'a5']);
    expect(r.promoted).toEqual(['b0', 'b1', 'b2']);
    // division 필드 반영
    const byId = new Map(clubs.map((c) => [c.id, c]));
    expect(byId.get('a5')!.division).toBe(1);
    expect(byId.get('b0')!.division).toBe(0);
    // 각 부 인원 유지(6)
    expect(clubsInDivision(clubs, 0)).toHaveLength(6);
    expect(clubsInDivision(clubs, 1)).toHaveLength(6);
  });
});
