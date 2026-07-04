import { describe, it, expect } from 'vitest';
import { simulateMatch } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { aggregatePlayerStats, topAssists, bestXI } from '../src/stats.js';
import { lineOf } from '../src/teamStrength.js';
import { Rng } from '../src/rng.js';
import type { MatchResult } from '../src/types.js';

/**
 * 어시스트 기록 + 베스트 XI (Phase 9 D01/D03) 회귀 테스트.
 * 예전엔 골 이벤트에 어시스트 개념 자체가 없었고, 시즌 종료 시 라인별 베스트
 * 선수를 뽑아주는 개념도 없었다.
 */
function matchup(seed: number) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

describe('D01: 어시스트 기록', () => {
  it('골 이벤트에 어시스트가 붙으면 assistPlayerId는 그 골을 넣은 선수와 다르다', () => {
    let checkedAssists = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { home, away, ht, at } = matchup(seed);
      const result = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      for (const ev of result.events) {
        if (ev.outcome !== 'GOAL' || ev.assistPlayerId === undefined) continue;
        checkedAssists++;
        expect(ev.assistPlayerId).not.toBe(ev.playerId);
      }
    }
    expect(checkedAssists).toBeGreaterThan(0);
  });

  it('어시스트 제공자는 GK가 아니다', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { home, away, ht, at } = matchup(seed);
      const result = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      const homeGkId = ht.lineup.find((s) => s.position === 'GK')?.playerId;
      const awayGkId = at.lineup.find((s) => s.position === 'GK')?.playerId;
      for (const ev of result.events) {
        if (ev.assistPlayerId === undefined) continue;
        expect(ev.assistPlayerId).not.toBe(homeGkId);
        expect(ev.assistPlayerId).not.toBe(awayGkId);
      }
    }
  });

  it('PlayerMatchStat.assists 합계는 실제 어시스트 이벤트 수와 정확히 일치한다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { home, away, ht, at } = matchup(seed);
      const result = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      const assistEventCount = result.events.filter((e) => e.assistPlayerId !== undefined).length;
      const statAssistTotal = [...result.playerStats.home, ...result.playerStats.away]
        .reduce((s, st) => s + st.assists, 0);
      expect(statAssistTotal).toBe(assistEventCount);
    }
  });

  it('aggregatePlayerStats는 여러 경기에 걸쳐 어시스트를 누적한다', () => {
    const { home, away, ht, at } = matchup(3);
    const results: MatchResult[] = [];
    for (let seed = 100; seed < 130; seed++) {
      results.push(simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed }));
    }
    const stats = aggregatePlayerStats(results);
    const totalFromStats = stats.reduce((s, a) => s + a.assists, 0);
    const totalFromResults = results
      .flatMap((r) => [...r.playerStats.home, ...r.playerStats.away])
      .reduce((s, st) => s + st.assists, 0);
    expect(totalFromStats).toBe(totalFromResults);
    expect(totalFromStats).toBeGreaterThan(0);
  });

  it('topAssists는 어시스트 내림차순으로 정렬한다', () => {
    const { home, away, ht, at } = matchup(5);
    const results: MatchResult[] = [];
    for (let seed = 200; seed < 230; seed++) {
      results.push(simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed }));
    }
    const stats = aggregatePlayerStats(results);
    const top = topAssists(stats, 5);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1]!.assists).toBeGreaterThanOrEqual(top[i]!.assists);
    }
  });
});

describe('D03: 시즌 베스트 XI', () => {
  it('11명을 GK 1·DEF 4·MID 3·ATT 3으로 라인별 정원에 맞게 구성한다', () => {
    const { home, away, ht, at } = matchup(7);
    const results: MatchResult[] = [];
    for (let seed = 300; seed < 340; seed++) {
      results.push(simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed }));
    }
    const stats = aggregatePlayerStats(results);
    const xi = bestXI(stats, 5);
    const counts = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    for (const p of xi) counts[lineOf(p.position)]++;
    expect(counts.GK).toBeLessThanOrEqual(1);
    expect(counts.DEF).toBeLessThanOrEqual(4);
    expect(counts.MID).toBeLessThanOrEqual(3);
    expect(counts.ATT).toBeLessThanOrEqual(3);
    expect(xi.length).toBeLessThanOrEqual(11);
  });

  it('최소 출전 기준 미달 선수는 베스트 XI에서 제외된다', () => {
    const { home, away, ht, at } = matchup(9);
    const results: MatchResult[] = [];
    for (let seed = 400; seed < 440; seed++) {
      results.push(simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed }));
    }
    const stats = aggregatePlayerStats(results);
    const highMinApps = 1000; // 아무도 이만큼 출전할 수 없는 임계값
    expect(bestXI(stats, highMinApps)).toEqual([]);
  });

  it('같은 라인 내에서는 평균 평점이 높은 선수부터 선발된다', () => {
    const { home, away, ht, at } = matchup(11);
    const results: MatchResult[] = [];
    for (let seed = 500; seed < 540; seed++) {
      results.push(simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed }));
    }
    const stats = aggregatePlayerStats(results);
    const xi = bestXI(stats, 5);
    const byLine = new Map<string, number[]>();
    for (const p of xi) {
      const line = lineOf(p.position);
      byLine.set(line, [...(byLine.get(line) ?? []), p.avgRating]);
    }
    for (const ratings of byLine.values()) {
      for (let i = 1; i < ratings.length; i++) expect(ratings[i - 1]!).toBeGreaterThanOrEqual(ratings[i]!);
    }
  });
});
