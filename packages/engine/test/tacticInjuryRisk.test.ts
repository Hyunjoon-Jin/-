import { describe, it, expect } from 'vitest';
import { createContext, generateInjuries } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function matchup(seed = 1) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

describe('전술 강도(압박·템포) 연동 부상 위험(고도화 항목52)', () => {
  it('고강도 전술(압박·템포 최대)은 중립 전술보다 평균 부상 발생 수가 많다(다수 시드 누적 비교)', () => {
    const { home, away, ht, at } = matchup(80);

    function countInjuries(seed: number, intense: boolean): number {
      const homeTactic = intense ? { ...ht, pressing: 1, tempo: 1 } : { ...ht, pressing: 0.5, tempo: 0.5 };
      const ctx = createContext({ home: { club: home, tactic: homeTactic }, away: { club: away, tactic: at }, seed });
      const injuries = generateInjuries(ctx);
      return injuries.filter((e) => e.side === 'home').length;
    }

    const N = 400;
    let intenseTotal = 0;
    let neutralTotal = 0;
    for (let seed = 1; seed <= N; seed++) {
      intenseTotal += countInjuries(seed, true);
      neutralTotal += countInjuries(seed, false);
    }
    expect(intenseTotal / N).toBeGreaterThan(neutralTotal / N);
  });

  it('중립(0.5) 이하 강도에서는 부상 확률에 영향이 없다(같은 시드면 완전히 동일)', () => {
    const { home, away, ht, at } = matchup(81);

    function countInjuries(seed: number, pressing: number): number {
      const homeTactic = { ...ht, pressing, tempo: 0.3 };
      const ctx = createContext({ home: { club: home, tactic: homeTactic }, away: { club: away, tactic: at }, seed });
      return generateInjuries(ctx).filter((e) => e.side === 'home').length;
    }

    for (let seed = 1; seed <= 5; seed++) {
      expect(countInjuries(seed, 0.5)).toBe(countInjuries(seed, 0.1));
    }
  });
});
