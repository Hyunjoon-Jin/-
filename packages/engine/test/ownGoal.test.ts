import { describe, it, expect } from 'vitest';
import { simulateMatch, ownGoalRiskMultiplier, weakestDefender, createContext } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { lineOf } from '../src/teamStrength.js';
import { Rng } from '../src/rng.js';
import type { Player } from '../src/types.js';

function matchup(seed = 1) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

function mkPlayer(overrides: Partial<Player['attributes']>): Player {
  const base = { decisions: 10, positioning: 10 } as Player['attributes'];
  return { attributes: { ...base, ...overrides } } as Player;
}

describe('ownGoalRiskMultiplier (고도화 항목42: 자책골)', () => {
  it('decisions·positioning 평균이 낮을수록 배율이 커진다', () => {
    const weak = mkPlayer({ decisions: 4, positioning: 4 });
    const strong = mkPlayer({ decisions: 18, positioning: 18 });
    expect(ownGoalRiskMultiplier(weak)).toBeGreaterThan(ownGoalRiskMultiplier(strong));
  });

  it('0.5~2.0 범위로 클램프된다', () => {
    expect(ownGoalRiskMultiplier(mkPlayer({ decisions: 20, positioning: 20 }))).toBeGreaterThanOrEqual(0.5);
    expect(ownGoalRiskMultiplier(mkPlayer({ decisions: 1, positioning: 1 }))).toBeLessThanOrEqual(2);
  });
});

describe('weakestDefender (고도화 항목42)', () => {
  it('DEF 라인 출전자 중 decisions+positioning 평균이 가장 낮은 선수를 고른다', () => {
    const { home, ht } = matchup(11);
    const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: home, tactic: ht }, seed: 11 });
    const worst = weakestDefender(ctx.home);
    expect(worst).not.toBeNull();
    const byId = new Map(home.players.map((p) => [p.id, p]));
    const defIds = ht.lineup.filter((s) => lineOf(s.position) === 'DEF').map((s) => s.playerId);
    const defScores = defIds
      .map((id) => byId.get(id)!)
      .map((p) => (p.attributes.decisions + p.attributes.positioning) / 2);
    const worstScore = (worst!.attributes.decisions + worst!.attributes.positioning) / 2;
    expect(worstScore).toBeLessThanOrEqual(Math.min(...defScores) + 1e-9);
  });
});

describe('simulateMatch: 자책골 발생(고도화 항목42, 다수 시드 누적 확인)', () => {
  it('많은 경기를 시뮬레이션하면 자책골이 실제로 발생한다', () => {
    const { home, away, ht, at } = matchup(21);
    let ownGoalCount = 0;
    const N = 400;
    for (let seed = 1; seed <= N; seed++) {
      const r = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      ownGoalCount += r.events.filter((e) => e.outcome === 'OWN_GOAL').length;
    }
    expect(ownGoalCount).toBeGreaterThan(0);
  });

  it('자책골 이벤트는 side가 득점을 얻는 공격측이고, playerId는 수비측 선수다', () => {
    const { home, away, ht, at } = matchup(33);
    let found = false;
    for (let seed = 1; seed <= 500 && !found; seed++) {
      const r = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      const og = r.events.find((e) => e.outcome === 'OWN_GOAL');
      if (!og) continue;
      found = true;
      expect(og.isOwnGoal).toBe(true);
      // side가 홈이면 실점 주체(playerId)는 원정팀(away) 소속이어야 한다(그 반대도 마찬가지).
      const scorerClub = og.side === 'home' ? away : home;
      const otherClub = og.side === 'home' ? home : away;
      expect(scorerClub.players.some((p) => p.id === og.playerId)).toBe(true);
      expect(otherClub.players.some((p) => p.id === og.playerId)).toBe(false);
      const stat = [...r.playerStats.home, ...r.playerStats.away].find((s) => s.playerId === og.playerId)!;
      expect(stat.ownGoals ?? 0).toBeGreaterThan(0);
      expect(stat.rating).toBeLessThan(6.0);
    }
    expect(found).toBe(true);
  });
});
