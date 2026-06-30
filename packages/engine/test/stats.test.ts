import { describe, it, expect } from 'vitest';
import { aggregatePlayerStats, topScorers, seasonAwards, summarizeStats } from '../src/stats.js';
import { simulateSeason } from '../src/league.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function season(seed = 1) {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < 8; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 8 + i));
  return simulateSeason(clubs, seed);
}

describe('stats: 시즌 통계 집계', () => {
  it('집계 득점 합이 실제 경기 득점 합과 일치한다', () => {
    const { matches } = season(11);
    const stats = aggregatePlayerStats(matches);
    const aggGoals = stats.reduce((s, p) => s + p.goals, 0);
    const matchGoals = matches.reduce((s, m) => s + m.score[0] + m.score[1], 0);
    expect(aggGoals).toBe(matchGoals);
  });

  it('출전 수·평점 범위가 타당하다', () => {
    const { matches } = season(22);
    const stats = aggregatePlayerStats(matches);
    expect(stats.length).toBeGreaterThan(0);
    for (const s of stats) {
      expect(s.apps).toBeGreaterThan(0);
      expect(s.avgRating).toBeGreaterThanOrEqual(1);
      expect(s.avgRating).toBeLessThanOrEqual(10);
    }
  });

  it('득점 순위는 내림차순', () => {
    const { matches } = season(33);
    const top = topScorers(aggregatePlayerStats(matches), 10);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1]!.goals).toBeGreaterThanOrEqual(top[i]!.goals);
    }
  });

  it('어워드: 득점왕과 시즌 베스트가 선정된다', () => {
    const { matches } = season(44);
    const stats = aggregatePlayerStats(matches);
    const awards = seasonAwards(stats, 7);
    expect(awards.topScorer).toBeDefined();
    expect(awards.topScorer!.goals).toBeGreaterThan(0);
    expect(awards.playerOfSeason).toBeDefined();
    expect(awards.playerOfSeason!.avgRating).toBeGreaterThan(0);
  });

  it('summarizeStats는 상위 10명과 어워드를 반환', () => {
    const { matches } = season(55);
    const { topScorers: ts, awards } = summarizeStats(matches, 14);
    expect(ts.length).toBeLessThanOrEqual(10);
    expect(awards).toBeDefined();
  });
});
