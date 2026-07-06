import { describe, it, expect } from 'vitest';
import {
  aggregatePlayerStats, topScorers, seasonAwards, summarizeStats, careerScorers, recentPlayerForm,
  seasonSquadSnapshot, clubDisciplineTable, monthlyManagerAwards, longestStreaks,
} from '../src/stats.js';
import { simulateSeason } from '../src/league.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club, MatchResult } from '../src/types.js';
import type { Fixture } from '../src/schedule.js';

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

function mkResult(overrides: Partial<MatchResult>): MatchResult {
  return {
    homeClubId: 'a', awayClubId: 'b', homeClubName: 'A', awayClubName: 'B',
    score: [0, 0], possession: [50, 50], shots: [0, 0], events: [], cards: [], injuries: [],
    playerStats: { home: [], away: [] }, seed: 1,
    ...overrides,
  };
}

describe('stats: 시즌 페어플레이(징계) 순위 (고도화 항목22)', () => {
  it('카드가 적은 구단이 상위, 카드 없는 구단은 0으로 집계된다', () => {
    const results: MatchResult[] = [
      mkResult({
        homeClubId: 'a', awayClubId: 'b', homeClubName: 'A', awayClubName: 'B',
        cards: [
          { minute: 10, side: 'home', playerId: 'p1', playerName: '선수1', type: 'yellow' },
          { minute: 20, side: 'home', playerId: 'p2', playerName: '선수2', type: 'yellow' },
          { minute: 30, side: 'away', playerId: 'p3', playerName: '선수3', type: 'yellow' },
        ],
      }),
      mkResult({ homeClubId: 'c', awayClubId: 'a', homeClubName: 'C', awayClubName: 'A' }),
    ];
    const table = clubDisciplineTable(results);
    expect(table.map((r) => r.clubId)).toEqual(['c', 'b', 'a']);
    expect(table.find((r) => r.clubId === 'a')).toEqual({
      clubId: 'a', clubName: 'A', yellowCards: 2, redCards: 0, totalCards: 2,
    });
    expect(table.find((r) => r.clubId === 'c')).toEqual({
      clubId: 'c', clubName: 'C', yellowCards: 0, redCards: 0, totalCards: 0,
    });
  });

  it('카드 수가 같으면 레드카드가 적은 쪽이 상위', () => {
    const results: MatchResult[] = [
      mkResult({
        homeClubId: 'a', awayClubId: 'b', homeClubName: 'A', awayClubName: 'B',
        cards: [
          { minute: 10, side: 'home', playerId: 'p1', playerName: '선수1', type: 'red' },
          { minute: 20, side: 'away', playerId: 'p2', playerName: '선수2', type: 'yellow' },
        ],
      }),
    ];
    const table = clubDisciplineTable(results);
    expect(table.map((r) => r.clubId)).toEqual(['b', 'a']);
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
      score: [1, 0], possession: [50, 50], shots: [1, 0], events: [], cards: [], injuries: [],
      playerStats: { home: [{ playerId: scorer.id, name: scorer.name, rating: 6 + i * 0.1, shots: 1, goals: 1 }], away: [] },
      seed: i,
    });
    const results = Array.from({ length: 8 }, (_, i) => mkResult(i));
    const form = recentPlayerForm(results, scorer.id, 3);
    expect(form).toHaveLength(3);
    expect(form.map((f) => f.opponentName)).toEqual(['Away5', 'Away6', 'Away7']);
  });
});

describe('stats: 시즌 스쿼드 스냅샷', () => {
  it('전술 라인업 순서대로, 각 슬롯에 선수 정보+통계가 채워진다', () => {
    const rng = new Rng(40);
    const clubs: Club[] = [];
    for (let i = 0; i < 8; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 8 + i));
    const club = clubs[0]!;
    const tactic = defaultTactic(club);
    const { matches } = simulateSeason(clubs, 41);
    const stats = aggregatePlayerStats(matches).filter((s) => s.clubId === club.id);

    const ages = new Map(club.players.map((p) => [p.id, p.age]));
    const squad = seasonSquadSnapshot(tactic, club, stats, ages);
    expect(squad).toHaveLength(tactic.lineup.length);
    squad.forEach((entry, i) => {
      expect(entry.position).toBe(tactic.lineup[i]!.position);
      expect(entry.playerId).toBe(tactic.lineup[i]!.playerId);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.age).toBeGreaterThan(0);
    });
  });

  it('통계가 없는 선수(미출전)는 평점 0으로 채워진다', () => {
    const rng = new Rng(42);
    const club = generateClub(rng, 'c', 'C', 12);
    const tactic = defaultTactic(club);
    const ages = new Map(club.players.map((p) => [p.id, p.age]));
    const squad = seasonSquadSnapshot(tactic, club, [], ages); // 통계 없음
    for (const entry of squad) {
      expect(entry.avgRating).toBe(0);
      expect(entry.goals).toBe(0);
    }
  });

  it('오프시즌으로 club.players의 나이가 바뀌어도 캡처해둔 시즌 당시 나이가 기록된다', () => {
    const rng = new Rng(43);
    const club = generateClub(rng, 'c', 'C', 12);
    const tactic = defaultTactic(club);
    const ages = new Map(club.players.map((p) => [p.id, p.age])); // 오프시즌 전 캡처
    for (const p of club.players) p.age += 1; // 오프시즌 나이 증가를 흉내
    const squad = seasonSquadSnapshot(tactic, club, [], ages);
    for (const entry of squad) {
      expect(entry.age).toBe(ages.get(entry.playerId));
      expect(entry.age).not.toBe(club.players.find((p) => p.id === entry.playerId)!.age);
    }
  });
});

describe('stats: 이달의 감독 (고도화 항목24)', () => {
  function fx(round: number, homeId: string, awayId: string): Fixture {
    return { round, homeId, awayId };
  }

  it('블록(기본 4라운드)별로 승점(동률이면 득실차) 최고 구단을 뽑는다', () => {
    const fixtures: Fixture[] = [
      fx(1, 'a', 'b'), fx(2, 'b', 'a'), fx(3, 'a', 'b'), fx(4, 'b', 'a'),
      fx(5, 'a', 'b'), fx(6, 'b', 'a'), fx(7, 'a', 'b'), fx(8, 'b', 'a'),
    ];
    const results: MatchResult[] = [
      // 1~4라운드: A가 전승
      mkResult({ homeClubId: 'a', awayClubId: 'b', homeClubName: 'A', awayClubName: 'B', score: [2, 0] }),
      mkResult({ homeClubId: 'b', awayClubId: 'a', homeClubName: 'B', awayClubName: 'A', score: [0, 3] }),
      mkResult({ homeClubId: 'a', awayClubId: 'b', homeClubName: 'A', awayClubName: 'B', score: [1, 0] }),
      mkResult({ homeClubId: 'b', awayClubId: 'a', homeClubName: 'B', awayClubName: 'A', score: [0, 1] }),
      // 5~8라운드: B가 전승
      mkResult({ homeClubId: 'a', awayClubId: 'b', homeClubName: 'A', awayClubName: 'B', score: [0, 2] }),
      mkResult({ homeClubId: 'b', awayClubId: 'a', homeClubName: 'B', awayClubName: 'A', score: [3, 0] }),
      mkResult({ homeClubId: 'a', awayClubId: 'b', homeClubName: 'A', awayClubName: 'B', score: [0, 1] }),
      mkResult({ homeClubId: 'b', awayClubId: 'a', homeClubName: 'B', awayClubName: 'A', score: [1, 0] }),
    ];

    const awards = monthlyManagerAwards(fixtures, results, 4);
    expect(awards).toHaveLength(2);
    expect(awards[0]).toMatchObject({ blockIndex: 1, fromRound: 1, toRound: 4, clubId: 'a', points: 12 });
    expect(awards[1]).toMatchObject({ blockIndex: 2, fromRound: 5, toRound: 8, clubId: 'b', points: 12 });
  });

  it('총 라운드 수가 블록 크기로 안 나뉘면 마지막 블록은 남은 라운드만으로 집계한다', () => {
    const fixtures: Fixture[] = [fx(1, 'a', 'b'), fx(2, 'b', 'a'), fx(3, 'a', 'b')];
    const results: MatchResult[] = [
      mkResult({ homeClubId: 'a', awayClubId: 'b', score: [1, 0] }),
      mkResult({ homeClubId: 'b', awayClubId: 'a', score: [0, 1] }),
      mkResult({ homeClubId: 'a', awayClubId: 'b', score: [2, 2] }),
    ];
    const awards = monthlyManagerAwards(fixtures, results, 4);
    expect(awards).toHaveLength(1);
    expect(awards[0]!.fromRound).toBe(1);
    expect(awards[0]!.toRound).toBe(3);
  });

  it('경기 결과가 없으면 빈 배열', () => {
    expect(monthlyManagerAwards([], [], 4)).toEqual([]);
  });
});

describe('stats: 연승/무패 기록 (고도화 항목25)', () => {
  it('중간에 패배가 끼면 연승은 끊기지만 무패는 무승부까지 이어간다', () => {
    const results: MatchResult[] = [
      mkResult({ homeClubId: 'a', awayClubId: 'x', score: [2, 0] }), // W
      mkResult({ homeClubId: 'a', awayClubId: 'x', score: [3, 0] }), // W
      mkResult({ homeClubId: 'a', awayClubId: 'x', score: [1, 1] }), // D → 연승 끊김, 무패는 유지
      mkResult({ homeClubId: 'a', awayClubId: 'x', score: [0, 2] }), // L → 둘 다 끊김
      mkResult({ homeClubId: 'a', awayClubId: 'x', score: [1, 0] }), // W
    ];
    const s = longestStreaks(results, 'a');
    expect(s.winStreak).toBe(2);
    expect(s.unbeatenStreak).toBe(3);
  });

  it('전승이면 승·무패 기록이 전체 경기 수와 같다', () => {
    const results: MatchResult[] = [
      mkResult({ homeClubId: 'a', awayClubId: 'x', score: [1, 0] }),
      mkResult({ homeClubId: 'x', awayClubId: 'a', score: [0, 1] }),
      mkResult({ homeClubId: 'a', awayClubId: 'x', score: [2, 0] }),
    ];
    const s = longestStreaks(results, 'a');
    expect(s.winStreak).toBe(3);
    expect(s.unbeatenStreak).toBe(3);
  });

  it('출전하지 않은 경기는 건너뛰고, 경기가 전혀 없으면 0', () => {
    const results: MatchResult[] = [
      mkResult({ homeClubId: 'x', awayClubId: 'y', score: [1, 0] }),
    ];
    expect(longestStreaks(results, 'a')).toEqual({ winStreak: 0, unbeatenStreak: 0 });
    expect(longestStreaks([], 'a')).toEqual({ winStreak: 0, unbeatenStreak: 0 });
  });
});
