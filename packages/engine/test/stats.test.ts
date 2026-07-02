import { describe, it, expect } from 'vitest';
import {
  aggregatePlayerStats, topScorers, seasonAwards, summarizeStats, careerScorers, recentPlayerForm,
} from '../src/stats.js';
import { simulateSeason } from '../src/league.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club, MatchResult } from '../src/types.js';

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

describe('stats: 최근 폼(선수)', () => {
  it('출전한 경기만 순서대로 최근 n개를 반환한다', () => {
    const { matches } = season(21);
    // 다수 경기에 출전한 선수 하나를 찾는다
    const stats = aggregatePlayerStats(matches);
    const frequent = stats.sort((a, b) => b.apps - a.apps)[0]!;
    const form = recentPlayerForm(matches, frequent.playerId, 5);
    expect(form.length).toBeGreaterThan(0);
    expect(form.length).toBeLessThanOrEqual(5);
    for (const f of form) {
      expect(f.rating).toBeGreaterThan(0);
      expect(f.opponentName.length).toBeGreaterThan(0);
    }
  });

  it('출전하지 않은 선수는 빈 배열', () => {
    const { matches } = season(22);
    expect(recentPlayerForm(matches, 'no-such-player', 5)).toEqual([]);
  });

  it('n으로 최근 개수를 제한한다(오래된 것 제외)', () => {
    const rng = new Rng(30);
    const home = generateClub(rng, 'h', 'H', 12);
    const away = generateClub(rng, 'a', 'A', 12);
    const ht = defaultTactic(home);
    const scorer = home.players.find((p) => ht.lineup.some((s) => s.playerId === p.id))!;
    const mkResult = (i: number): MatchResult => ({
      homeClubId: home.id, awayClubId: away.id, homeClubName: home.name, awayClubName: `Away${i}`,
      score: [1, 0], possession: [50, 50], shots: [1, 0], events: [], cards: [],
      playerStats: { home: [{ playerId: scorer.id, name: scorer.name, rating: 6 + i * 0.1, shots: 1, goals: 1 }], away: [] },
      seed: i,
    });
    const results = Array.from({ length: 8 }, (_, i) => mkResult(i));
    const form = recentPlayerForm(results, scorer.id, 3);
    expect(form).toHaveLength(3);
    expect(form.map((f) => f.opponentName)).toEqual(['Away5', 'Away6', 'Away7']);
  });
});
