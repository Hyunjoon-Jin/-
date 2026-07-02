import { describe, it, expect } from 'vitest';
import { runOffseason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

describe('debutEvents: 유스 기대주 데뷔·첫 골 감지', () => {
  it('통산 출전/득점이 0에서 처음 양수로 바뀐 선수만 debut/firstGoal로 기록한다', () => {
    const rng = new Rng(77);
    const club: Club = generateClub(rng, 'z', 'Z', 12);
    const debutant = club.players[0]!;
    debutant.careerApps = 0;
    debutant.careerGoals = 0;
    debutant.seasonApps = 5;
    debutant.seasonGoals = 2;

    const veteran = club.players[1]!;
    veteran.careerApps = 40;
    veteran.careerGoals = 10;
    veteran.seasonApps = 5;
    veteran.seasonGoals = 1;

    const untouched = club.players[2]!;
    untouched.careerApps = 0;
    untouched.careerGoals = 0;
    untouched.seasonApps = 0;
    untouched.seasonGoals = 0;

    const { debutEvents } = runOffseason([club], new Rng(88));
    const forDebutant = debutEvents.filter((e) => e.playerId === debutant.id);
    expect(forDebutant.map((e) => e.kind).sort()).toEqual(['debut', 'firstGoal']);
    expect(debutEvents.some((e) => e.playerId === veteran.id)).toBe(false);
    expect(debutEvents.some((e) => e.playerId === untouched.id)).toBe(false);
  });

  it('다음 시즌에는 같은 선수라도 다시 debut/firstGoal이 기록되지 않는다(통산 기록이 이미 0이 아니므로)', () => {
    const rng = new Rng(99);
    const club: Club = generateClub(rng, 'y', 'Y', 12);
    const p = club.players[0]!;
    p.age = 20; // 은퇴 연령(37)과 충분히 멀리 — 두 시즌 연속 생존 보장
    p.careerApps = 0;
    p.careerGoals = 0;
    p.seasonApps = 3;
    p.seasonGoals = 1;

    const first = runOffseason([club], new Rng(111));
    expect(first.debutEvents.some((e) => e.playerId === p.id && e.kind === 'debut')).toBe(true);
    expect(first.debutEvents.some((e) => e.playerId === p.id && e.kind === 'firstGoal')).toBe(true);

    // 다음 시즌: 다시 출전/득점이 있어도 통산 기록이 이미 0이 아니므로 재발생하지 않는다.
    p.seasonApps = 4;
    p.seasonGoals = 1;
    const second = runOffseason([club], new Rng(222));
    expect(second.debutEvents.some((e) => e.playerId === p.id)).toBe(false);
  });
});
