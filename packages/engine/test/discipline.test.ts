import { describe, it, expect } from 'vitest';
import { applyMatchEffects } from '../src/matchEffects.js';
import { simulateMatch } from '../src/simulateMatch.js';
import { computeTeamStrength } from '../src/teamStrength.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { isAvailable, isSuspended } from '../src/derived.js';
import { Rng } from '../src/rng.js';
import type { Club, MatchResult } from '../src/types.js';

function matchup(seed = 1) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

function cardResult(home: Club, away: Club, cards: MatchResult['cards']): MatchResult {
  return {
    homeClubId: home.id, awayClubId: away.id, homeClubName: home.name, awayClubName: away.name,
    score: [0, 0], possession: [50, 50], shots: [0, 0], events: [], cards,
    playerStats: { home: [], away: [] }, seed: 1,
  };
}

describe('discipline: 카드 생성', () => {
  it('경기 결과에 카드 배열이 포함되고, 분은 오름차순', () => {
    const { home, away, ht, at } = matchup(42);
    const r = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed: 42 });
    expect(Array.isArray(r.cards)).toBe(true);
    for (let i = 1; i < r.cards.length; i++) {
      expect(r.cards[i]!.minute).toBeGreaterThanOrEqual(r.cards[i - 1]!.minute);
    }
  });

  it('같은 시드는 같은 카드 (재현성)', () => {
    const a = simulateMatch({ ...setup(7), seed: 7 });
    const b = simulateMatch({ ...setup(7), seed: 7 });
    expect(a.cards.map((c) => `${c.minute}:${c.type}:${c.playerId}`))
      .toEqual(b.cards.map((c) => `${c.minute}:${c.type}:${c.playerId}`));
  });
});

function setup(seed: number) {
  const { home, away, ht, at } = matchup(seed);
  return { home: { club: home, tactic: ht }, away: { club: away, tactic: at } };
}

describe('discipline: 징계 반영', () => {
  it('퇴장은 즉시 출전 정지된다', () => {
    const { home, away, ht, at } = matchup(3);
    const p = home.players[7]!;
    applyMatchEffects(home, ht, away, at,
      cardResult(home, away, [{ minute: 30, side: 'home', playerId: p.id, playerName: p.name, type: 'red' }]),
      new Rng(1));
    expect(isSuspended(p)).toBe(true);
    expect(p.suspensionMatches).toBeGreaterThanOrEqual(2);
  });

  it('경고 5장 누적 시 1경기 출전 정지', () => {
    const { home, away, ht, at } = matchup(4);
    const p = home.players[6]!;
    for (let i = 0; i < 5; i++) {
      // 매 경기 이 선수만 경고. 미출전 선수 카운트다운을 피하려 정지 전까지만
      applyMatchEffects(home, ht, away, at,
        cardResult(home, away, [{ minute: 40, side: 'home', playerId: p.id, playerName: p.name, type: 'yellow' }]),
        new Rng(100 + i));
    }
    expect(p.yellowCards).toBe(5);
    expect(p.suspensionMatches).toBeGreaterThanOrEqual(1);
  });

  it('출전 정지 선수는 팀 전력에서 제외된다 (GK 정지 → GK 전력 하락)', () => {
    const { home } = matchup(5);
    const tactic = defaultTactic(home);
    const before = computeTeamStrength(home, tactic);
    // GK 슬롯(0번) 정지 → 출전 GK 없음 → gk 전력이 대체값으로 하락
    const gkId = tactic.lineup[0]!.playerId;
    const gk = home.players.find((p) => p.id === gkId)!;
    gk.suspensionMatches = 1;
    expect(isAvailable(gk)).toBe(false);
    const during = computeTeamStrength(home, tactic);
    expect(during.gk).toBeLessThan(before.gk);
  });
});
