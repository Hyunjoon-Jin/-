import { describe, it, expect } from 'vitest';
import { applyMatchEffects } from '../src/matchEffects.js';
import { computeTeamStrength } from '../src/teamStrength.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club, MatchResult, Tactic } from '../src/types.js';

function fakeResult(home: Club, away: Club, hg: number, ag: number): MatchResult {
  return {
    homeClubId: home.id, awayClubId: away.id,
    homeClubName: home.name, awayClubName: away.name,
    score: [hg, ag], possession: [50, 50], shots: [0, 0],
    events: [], playerStats: { home: [], away: [] }, seed: 1,
  };
}

function setup() {
  const rng = new Rng(1);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 13);
  // 컨디션을 중간값으로 낮춰 피로/회복을 관찰
  for (const c of [home, away]) for (const p of c.players) p.condition = 0.5;
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

describe('matchEffects: 피로·회복·사기', () => {
  it('선발은 피로로 컨디션이 내려가고 벤치는 회복한다', () => {
    const { home, away, ht, at } = setup();
    const starters = new Set(ht.lineup.map((s) => s.playerId));
    applyMatchEffects(home, ht, away, at, fakeResult(home, away, 1, 0), new Rng(42));

    const starter = home.players.find((p) => starters.has(p.id))!;
    const bench = home.players.find((p) => !starters.has(p.id))!;
    expect(starter.condition).toBeLessThan(0.5);
    expect(bench.condition).toBeGreaterThan(0.5);
  });

  it('승리는 사기를 올리고 패배는 내린다', () => {
    const { home, away, ht, at } = setup();
    applyMatchEffects(home, ht, away, at, fakeResult(home, away, 2, 0), new Rng(7));
    expect(home.players[0]!.morale).toBeGreaterThan(0.5);
    expect(away.players[0]!.morale).toBeLessThan(0.5);
  });

  it('부상 카운트다운이 감소하고 복귀 시 컨디션이 회복된다', () => {
    const { home, away, ht, at } = setup();
    home.players[0]!.injuryMatches = 1;
    home.players[0]!.condition = 0.3;
    applyMatchEffects(home, ht, away, at, fakeResult(home, away, 0, 0), new Rng(9));
    expect(home.players[0]!.injuryMatches).toBe(0);
    expect(home.players[0]!.condition).toBeGreaterThanOrEqual(0.5);
  });

  it('부상 선수는 팀 전력 산출에서 제외된다(빈 슬롯)', () => {
    const rng = new Rng(2);
    const club = generateClub(rng, 'c', 'C', 13);
    const tactic = defaultTactic(club);
    const before = computeTeamStrength(club, tactic);
    // 선발 전원 부상 처리
    const starters = new Set(tactic.lineup.map((s) => s.playerId));
    for (const p of club.players) if (starters.has(p.id)) p.injuryMatches = 5;
    const after = computeTeamStrength(club, tactic);
    // 부상으로 출전 가능한 선발이 사라지면 전력이 크게 약화된다
    expect(after.attack).toBeLessThan(before.attack);
    expect(after.defense).toBeLessThan(before.defense);
  });

  it('동일 시드면 동일한 상태 변화 (재현성)', () => {
    const a = setup();
    const b = setup();
    applyMatchEffects(a.home, a.ht, a.away, a.at, fakeResult(a.home, a.away, 1, 1), new Rng(123));
    applyMatchEffects(b.home, b.ht, b.away, b.at, fakeResult(b.home, b.away, 1, 1), new Rng(123));
    expect(a.home.players.map((p) => p.condition))
      .toEqual(b.home.players.map((p) => p.condition));
    expect(a.home.players.map((p) => p.injuryMatches))
      .toEqual(b.home.players.map((p) => p.injuryMatches));
  });
});
