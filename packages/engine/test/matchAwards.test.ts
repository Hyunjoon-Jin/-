import { describe, it, expect } from 'vitest';
import { simulateMatch } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { goldenGlove } from '../src/stats.js';
import { Rng } from '../src/rng.js';
import type { PlayerSeasonStat } from '../src/stats.js';

/**
 * 맨오브더매치 자동 산출 + 클린시트/골든글러브(Phase 5 교차 스윕 D5/D2) 회귀 테스트.
 * 예전엔 GK가 무실점으로 막아도 그 기록이 어디에도 남지 않았고, 경기 최고 활약을
 * 따로 골라주는 개념도 없었다 — 둘 다 이미 계산된 statMap/rating에서 파생만 하면
 * 되는 값이라 순수 함수로 검증한다.
 */
function matchup(seed: number) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

describe('맨오브더매치 자동 산출', () => {
  it('양 팀 통틀어 최고 평점(동률이면 최다 득점) 선수가 motmPlayerId다', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const { home, away, ht, at } = matchup(seed);
      const result = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      const all = [...result.playerStats.home, ...result.playerStats.away];
      if (all.length === 0) continue;
      const best = [...all].sort((a, b) => b.rating - a.rating || b.goals - a.goals)[0]!;
      expect(result.motmPlayerId).toBe(best.playerId);
    }
  });
});

describe('클린시트(GK 무실점) 판정', () => {
  it('GK의 cleanSheet은 상대가 득점하지 못했을 때만 true다', () => {
    let checked = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { home, away, ht, at } = matchup(seed);
      const result = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      const homeGkId = ht.lineup.find((s) => s.position === 'GK')?.playerId;
      const awayGkId = at.lineup.find((s) => s.position === 'GK')?.playerId;
      const homeGkStat = result.playerStats.home.find((s) => s.playerId === homeGkId);
      const awayGkStat = result.playerStats.away.find((s) => s.playerId === awayGkId);
      if (homeGkStat) { expect(homeGkStat.cleanSheet).toBe(result.score[1] === 0); checked++; }
      if (awayGkStat) { expect(awayGkStat.cleanSheet).toBe(result.score[0] === 0); checked++; }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('GK가 아닌 선수는 cleanSheet이 설정되지 않는다', () => {
    const { home, away, ht, at } = matchup(1);
    const result = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed: 1 });
    const outfielders = result.playerStats.home.filter((s) => s.playerId !== ht.lineup.find((l) => l.position === 'GK')?.playerId);
    for (const st of outfielders) expect(st.cleanSheet).toBeUndefined();
  });
});

describe('골든글러브', () => {
  function stat(overrides: Partial<PlayerSeasonStat>): PlayerSeasonStat {
    return {
      playerId: 'p', name: 'P', clubId: 'c', clubName: 'C',
      apps: 10, goals: 0, shots: 0, avgRating: 6.5, cleanSheets: 0,
      ...overrides,
    };
  }

  it('클린시트가 가장 많은 GK를 골든글러브로 선정한다', () => {
    const stats = [
      stat({ playerId: 'gk1', cleanSheets: 5, avgRating: 6.5 }),
      stat({ playerId: 'gk2', cleanSheets: 3, avgRating: 7.0 }),
      stat({ playerId: 'st1', cleanSheets: 0, goals: 8, avgRating: 7.2 }),
    ];
    expect(goldenGlove(stats)?.playerId).toBe('gk1');
  });

  it('클린시트 수가 같으면 평점이 높은 쪽이 선정된다', () => {
    const stats = [
      stat({ playerId: 'gk1', cleanSheets: 4, avgRating: 6.5 }),
      stat({ playerId: 'gk2', cleanSheets: 4, avgRating: 7.1 }),
    ];
    expect(goldenGlove(stats)?.playerId).toBe('gk2');
  });

  it('클린시트가 하나도 없으면 undefined다', () => {
    const stats = [stat({ playerId: 'st1', cleanSheets: 0, goals: 8 })];
    expect(goldenGlove(stats)).toBeUndefined();
  });
});
