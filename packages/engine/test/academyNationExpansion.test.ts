import { describe, it, expect } from 'vitest';
import { academyNationPool } from '../src/scouting.js';

describe('고도화 Item12: 아카데미 유스풀 국가 확장', () => {
  it('스카우팅 레벨을 1씩 올릴 때마다 세밀하게(과거 3단계보다 촘촘히) 국적 풀이 늘어난다', () => {
    const sizes = Array.from({ length: 21 }, (_, lvl) => academyNationPool(lvl).length);
    // 과거에는 0/8/15 세 지점에서만 늘었다 — 이제는 더 많은 지점에서 늘어야 한다.
    const growthPoints = sizes.slice(1).filter((size, i) => size > sizes[i]!).length;
    expect(growthPoints).toBeGreaterThan(3);
  });

  it('레벨이 오를수록 풀이 누적 확장(부분집합 관계)된다', () => {
    for (let lvl = 0; lvl < 20; lvl++) {
      const lower = academyNationPool(lvl);
      const higher = academyNationPool(lvl + 1);
      expect(higher.length).toBeGreaterThanOrEqual(lower.length);
      for (const n of lower) expect(higher).toContain(n);
    }
  });

  it('최고 레벨(20)에서는 과거보다 더 다양한 국가(10개국 초과)가 열린다', () => {
    const fullPool = academyNationPool(20);
    expect(fullPool.length).toBeGreaterThan(10);
    expect(new Set(fullPool).size).toBe(fullPool.length); // 중복 없음
  });

  it('최저 레벨(0)에서도 핵심 4개국은 항상 열려 있다(하위 호환)', () => {
    const basePool = academyNationPool(0);
    for (const n of ['KOR', 'JPN', 'ENG', 'ESP']) expect(basePool).toContain(n);
  });
});
