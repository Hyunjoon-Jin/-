import { describe, it, expect } from 'vitest';
import { advanceSeason, runOffseason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { currentAbility } from '../src/derived.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

describe('growth: CA 성장 곡선', () => {
  it('오프시즌마다 CA 스냅샷이 1개씩 쌓인다', () => {
    const rng = new Rng(1);
    const clubs = [generateClub(rng, 'a', 'A', 12), generateClub(rng, 'b', 'B', 12)];
    const p = clubs[0]!.players[0]!;
    expect(p.caHistory).toEqual([]);

    runOffseason(clubs, new Rng(2));
    expect(p.caHistory).toHaveLength(1);
    runOffseason(clubs, new Rng(3));
    expect(p.caHistory).toHaveLength(2);
    // 스냅샷은 그 시점 CA와 근접(반올림)
    expect(p.caHistory[1]).toBe(Math.round(currentAbility(p)));
  });

  it('멀티시즌 후 여러 선수에 곡선이 생긴다', () => {
    const rng = new Rng(4);
    const clubs: Club[] = [];
    for (let i = 0; i < 6; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 10 + i));
    for (let s = 1; s <= 4; s++) advanceSeason(clubs, s, 1000 + s * 100);
    // 시즌 내내 생존한 선수는 4개 이하(은퇴·이적 변동)지만 최소 1개는 존재
    const withHistory = clubs.flatMap((c) => c.players).filter((p) => p.caHistory.length > 0);
    expect(withHistory.length).toBeGreaterThan(0);
    for (const p of withHistory) expect(p.caHistory.length).toBeLessThanOrEqual(20);
  });
});
