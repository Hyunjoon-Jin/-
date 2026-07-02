import { describe, it, expect } from 'vitest';
import { runOffseason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

describe('milestones: 통산 마일스톤', () => {
  it('임계값을 이번 시즌에 처음 넘으면 기록된다', () => {
    const rng = new Rng(1);
    const club = generateClub(rng, 'c', 'C', 12);
    const p = club.players[0]!;
    p.careerApps = 48; p.seasonApps = 5; // 48→53, 50 돌파
    p.careerGoals = 9; p.seasonGoals = 2; // 9→11, 10 돌파

    const result = runOffseason([club], new Rng(2));
    const apps50 = result.milestones.find((m) => m.playerId === p.id && m.kind === 'apps' && m.value === 50);
    const goals10 = result.milestones.find((m) => m.playerId === p.id && m.kind === 'goals' && m.value === 10);
    expect(apps50).toBeDefined();
    expect(goals10).toBeDefined();
  });

  it('이미 넘은 임계값은 다시 기록되지 않는다', () => {
    const rng = new Rng(3);
    const club = generateClub(rng, 'c', 'C', 12);
    const p = club.players[0]!;
    p.careerApps = 120; p.seasonApps = 10; // 이미 100 넘음, 150 아직 안 넘음
    const result = runOffseason([club], new Rng(4));
    expect(result.milestones.some((m) => m.playerId === p.id && m.kind === 'apps' && m.value === 100)).toBe(false);
    expect(result.milestones.some((m) => m.playerId === p.id && m.kind === 'apps' && m.value === 50)).toBe(false);
  });

  it('한 시즌에 여러 임계값을 동시에 넘으면 모두 기록된다', () => {
    const rng = new Rng(5);
    const club = generateClub(rng, 'c', 'C', 12);
    const p = club.players[0]!;
    p.careerApps = 40; p.seasonApps = 70; // 40→110, 50과 100 모두 돌파
    const result = runOffseason([club], new Rng(6));
    const mine = result.milestones.filter((m) => m.playerId === p.id && m.kind === 'apps');
    expect(mine.map((m) => m.value).sort((a, b) => a - b)).toEqual([50, 100]);
  });

  it('평범한 선수(임계값 미달)는 마일스톤이 없다', () => {
    const rng = new Rng(7);
    const club = generateClub(rng, 'c', 'C', 12);
    for (const p of club.players) { p.careerApps = 0; p.careerGoals = 0; p.seasonApps = 1; p.seasonGoals = 0; }
    const result = runOffseason([club], new Rng(8));
    expect(result.milestones).toHaveLength(0);
  });
});
