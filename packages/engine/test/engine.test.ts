import { describe, it, expect } from 'vitest';
import { Rng } from '../src/rng.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { simulateMatch } from '../src/simulateMatch.js';
import { simulateSeason } from '../src/league.js';
import type { Club } from '../src/types.js';

describe('Rng', () => {
  it('같은 시드는 같은 수열을 낸다 (결정론)', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('다른 시드는 다른 수열을 낸다', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('next()는 [0,1) 범위', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

function makeMatch(seed: number) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 13);
  return {
    home: { club: home, tactic: defaultTactic(home) },
    away: { club: away, tactic: defaultTactic(away) },
    seed,
  };
}

describe('simulateMatch', () => {
  it('같은 시드 + 같은 입력 = 완전히 같은 결과 (재현성)', () => {
    const setup = makeMatch(999);
    const r1 = simulateMatch(setup);
    const r2 = simulateMatch(setup);
    expect(r1.score).toEqual(r2.score);
    expect(r1.events.length).toBe(r2.events.length);
    expect(r1.possession).toEqual(r2.possession);
  });

  it('점유율 합은 100% 근처', () => {
    const r = simulateMatch(makeMatch(55));
    expect(r.possession[0] + r.possession[1]).toBeGreaterThanOrEqual(99);
    expect(r.possession[0] + r.possession[1]).toBeLessThanOrEqual(101);
  });

  it('골 이벤트 수와 스코어가 일치한다', () => {
    const r = simulateMatch(makeMatch(321));
    const homeGoals = r.events.filter((e) => e.side === 'home' && e.outcome === 'GOAL').length;
    const awayGoals = r.events.filter((e) => e.side === 'away' && e.outcome === 'GOAL').length;
    expect([homeGoals, awayGoals]).toEqual(r.score);
  });
});

describe('전력 반영', () => {
  it('강팀이 약팀을 상대로 다수 경기에서 우세하다', () => {
    let strongWins = 0;
    let weakWins = 0;
    for (let s = 0; s < 50; s++) {
      const rng = new Rng(1000 + s);
      const strong = generateClub(rng, 'st', 'Strong', 16);
      const weak = generateClub(rng, 'wk', 'Weak', 9);
      const r = simulateMatch({
        home: { club: strong, tactic: defaultTactic(strong) },
        away: { club: weak, tactic: defaultTactic(weak) },
        seed: 1000 + s,
      });
      if (r.score[0] > r.score[1]) strongWins++;
      else if (r.score[0] < r.score[1]) weakWins++;
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2);
  });
});

describe('시즌 분포 (밸런싱 가드레일)', () => {
  it('평균 득점이 현실 범위(2.0~3.5)이고 강팀이 상위권이다', () => {
    const rng = new Rng(424242);
    const clubs: Club[] = [];
    const tierOf = new Map<string, number>();
    for (let i = 0; i < 12; i++) {
      const tier = 9 + Math.round((i / 11) * 7);
      const id = `c${i}`;
      clubs.push(generateClub(rng, id, `C${i}`, tier));
      tierOf.set(id, tier);
    }
    const { table, matches } = simulateSeason(clubs, 424242);
    const avgGoals =
      matches.reduce((s, m) => s + m.score[0] + m.score[1], 0) / matches.length;
    expect(avgGoals).toBeGreaterThan(2.0);
    expect(avgGoals).toBeLessThan(3.5);

    // 최상위 tier 구단이 상위 절반에 든다
    const topTierId = [...tierOf.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const pos = table.findIndex((r) => r.clubId === topTierId);
    expect(pos).toBeLessThan(table.length / 2);
  });
});
