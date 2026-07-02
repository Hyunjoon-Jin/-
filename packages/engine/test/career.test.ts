import { describe, it, expect } from 'vitest';
import { applyMatchEffects } from '../src/matchEffects.js';
import { runOffseason } from '../src/franchise.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club, MatchResult } from '../src/types.js';

function fakeResult(home: Club, away: Club, hg: number, ag: number, scorerId?: string): MatchResult {
  return {
    homeClubId: home.id, awayClubId: away.id,
    homeClubName: home.name, awayClubName: away.name,
    score: [hg, ag], possession: [50, 50], shots: [hg, ag],
    events: [], cards: [], injuries: [],
    playerStats: {
      home: scorerId ? [{ playerId: scorerId, name: 'S', rating: 8, shots: hg, goals: hg }] : [],
      away: [],
    },
    seed: 1,
  };
}

describe('career: 통산 기록', () => {
  it('경기 득점이 시즌 득점에 누적된다', () => {
    const rng = new Rng(1);
    const home = generateClub(rng, 'h', 'H', 13);
    const away = generateClub(rng, 'a', 'A', 13);
    const ht = defaultTactic(home);
    const at = defaultTactic(away);
    const scorer = home.players.find((p) => ht.lineup.some((s) => s.playerId === p.id))!;
    expect(scorer.seasonGoals).toBe(0);

    applyMatchEffects(home, ht, away, at, fakeResult(home, away, 2, 0, scorer.id), new Rng(9));
    expect(scorer.seasonGoals).toBe(2);

    applyMatchEffects(home, ht, away, at, fakeResult(home, away, 1, 0, scorer.id), new Rng(10));
    expect(scorer.seasonGoals).toBe(3);
  });

  it('오프시즌에 시즌 기록이 통산으로 넘어가고 리셋된다', () => {
    const rng = new Rng(2);
    const clubs = [generateClub(rng, 'c', 'C', 12), generateClub(rng, 'd', 'D', 12)];
    const p = clubs[0]!.players[0]!;
    p.seasonApps = 20;
    p.seasonGoals = 7;
    p.careerApps = 30;
    p.careerGoals = 11;

    runOffseason(clubs, new Rng(3));

    expect(p.careerApps).toBe(50);   // 30 + 20
    expect(p.careerGoals).toBe(18);  // 11 + 7
    expect(p.seasonApps).toBe(0);
    expect(p.seasonGoals).toBe(0);
  });

  it('멀티시즌 진행 후 통산 출전이 쌓인다', async () => {
    const { advanceSeason } = await import('../src/franchise.js');
    const rng = new Rng(4);
    const clubs: Club[] = [];
    for (let i = 0; i < 6; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 10 + i));
    for (let s = 1; s <= 3; s++) advanceSeason(clubs, s, 1000 + s * 100);
    const anyCareer = clubs.flatMap((c) => c.players).some((p) => p.careerApps > 0);
    expect(anyCareer).toBe(true);
  });
});
