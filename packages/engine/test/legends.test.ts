import { describe, it, expect } from 'vitest';
import { runOffseason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

describe('legends: 은퇴 스냅샷', () => {
  it('은퇴 나이 이상 선수는 통산 기록과 함께 캡처되고 스쿼드에서 제거된다', () => {
    const rng = new Rng(1);
    const club = generateClub(rng, 'c', 'C', 12);
    const veteran = club.players[0]!;
    veteran.age = 36; // 오프시즌 진행 후 37세 → 은퇴 기준(37) 충족
    veteran.careerApps = 250;
    veteran.careerGoals = 60;
    veteran.caps = 40;
    veteran.seasonApps = 10;
    veteran.seasonGoals = 3;

    const result = runOffseason([club], new Rng(2));

    const legend = result.retiredPlayers.find((r) => r.playerId === veteran.id);
    expect(legend).toBeDefined();
    expect(legend!.finalAge).toBe(37);
    expect(legend!.careerApps).toBe(260); // 250 + 10(이번 시즌 출전 이월)
    expect(legend!.careerGoals).toBe(63); // 60 + 3
    expect(legend!.caps).toBe(40);
    expect(legend!.clubId).toBe(club.id);
    expect(club.players.some((p) => p.id === veteran.id)).toBe(false);
  });

  it('은퇴하지 않은 선수는 스냅샷에 없다', () => {
    const rng = new Rng(3);
    const club = generateClub(rng, 'c', 'C', 12);
    for (const p of club.players) p.age = 25;
    const result = runOffseason([club], new Rng(4));
    expect(result.retiredPlayers).toHaveLength(0);
  });

  it('은퇴 인원 수는 retirements 카운트와 일치한다', () => {
    const rng = new Rng(5);
    const clubs: Club[] = [generateClub(rng, 'c', 'C', 12), generateClub(rng, 'd', 'D', 12)];
    for (const c of clubs) { c.players[0]!.age = 36; c.players[1]!.age = 36; }
    const result = runOffseason(clubs, new Rng(6));
    expect(result.retiredPlayers).toHaveLength(result.retirements);
  });
});
