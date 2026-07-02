import { describe, it, expect } from 'vitest';
import { aggregatePlayerStats, topScorers, seasonAwards, summarizeStats, careerScorers } from '../src/stats.js';
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

describe('stats: 통산 득점 순위', () => {
  it('통산+시즌 득점을 합산해 내림차순 정렬, n 제한', () => {
    const rng = new Rng(3);
    const clubs = [generateClub(rng, 'a', 'A', 14), generateClub(rng, 'b', 'B', 12)];
    const [p1, p2, p3] = [clubs[0]!.players[0]!, clubs[0]!.players[1]!, clubs[1]!.players[0]!];
    p1.careerGoals = 40; p1.seasonGoals = 5;   // 45
    p2.careerGoals = 10; p2.seasonGoals = 2;   // 12
    p3.careerGoals = 20; p3.seasonGoals = 0;   // 20

    const leaders = careerScorers(clubs, 2);
    expect(leaders).toHaveLength(2);
    expect(leaders[0]!.playerId).toBe(p1.id);
    expect(leaders[0]!.goals).toBe(45);
    expect(leaders[1]!.playerId).toBe(p3.id);
    expect(leaders[1]!.goals).toBe(20);
  });

  it('기록이 전혀 없는 선수는 제외', () => {
    const rng = new Rng(4);
    const clubs = [generateClub(rng, 'a', 'A', 12)];
    for (const p of clubs[0]!.players) { p.careerGoals = 0; p.seasonGoals = 0; p.careerApps = 0; p.seasonApps = 0; }
    expect(careerScorers(clubs)).toHaveLength(0);
  });
});
