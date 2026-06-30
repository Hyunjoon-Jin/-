import { describe, it, expect } from 'vitest';
import { doubleRoundRobin } from '../src/schedule.js';
import {
  createSeasonState, playRound, playNext, playToEnd, computeTable,
  isSeasonOver, totalRounds, currentRound,
} from '../src/season.js';
import { simulateSeason } from '../src/league.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function makeClubs(n: number, seed = 1): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < n; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 12));
  return clubs;
}

describe('schedule: 더블 라운드 로빈', () => {
  it('n팀이면 n*(n-1)경기, 2*(n-1)라운드', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const fx = doubleRoundRobin(ids);
    const n = ids.length;
    expect(fx.length).toBe(n * (n - 1));
    expect(Math.max(...fx.map((f) => f.round))).toBe(2 * (n - 1));
  });

  it('각 팀은 모든 상대와 홈/원정 한 번씩 만난다', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const fx = doubleRoundRobin(ids);
    const pairs = new Set(fx.map((f) => `${f.homeId}>${f.awayId}`));
    expect(pairs.size).toBe(fx.length); // 중복 없음
    for (const h of ids) for (const a of ids) {
      if (h !== a) expect(pairs.has(`${h}>${a}`)).toBe(true);
    }
  });

  it('한 라운드에 모든 팀이 정확히 한 번 등장한다 (짝수 팀)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const fx = doubleRoundRobin(ids);
    const rounds = new Map<number, string[]>();
    for (const f of fx) {
      const arr = rounds.get(f.round) ?? [];
      arr.push(f.homeId, f.awayId);
      rounds.set(f.round, arr);
    }
    for (const [, teams] of rounds) {
      expect(teams.sort()).toEqual([...ids].sort());
    }
  });
});

describe('season: 상태 기반 진행', () => {
  it('라운드 단위로 진행하면 라운드 번호가 1씩 오른다', () => {
    const s = createSeasonState(makeClubs(6), 100);
    expect(currentRound(s)).toBe(1);
    playRound(s);
    expect(currentRound(s)).toBe(2);
    expect(s.results.length).toBe(3); // 6팀 → 라운드당 3경기
  });

  it('playToEnd 후 시즌 종료, 모든 경기 소진', () => {
    const clubs = makeClubs(6);
    const s = createSeasonState(clubs, 100);
    playToEnd(s);
    expect(isSeasonOver(s)).toBe(true);
    expect(s.results.length).toBe(6 * 5);
    // 모든 팀이 2*(n-1)=10경기를 치른다
    const table = computeTable(s);
    for (const row of table) expect(row.played).toBe(10);
  });

  it('상태 기반 결과가 simulateSeason(일괄)과 정확히 일치한다', () => {
    const a = makeClubs(8, 5);
    const b = makeClubs(8, 5);
    const viaState = (() => {
      const s = createSeasonState(a, 999);
      playToEnd(s);
      return computeTable(s);
    })();
    const viaBatch = simulateSeason(b, 999).table;
    expect(viaState.map((r) => `${r.name}:${r.points}`))
      .toEqual(viaBatch.map((r) => `${r.name}:${r.points}`));
  });

  it('playNext는 한 경기씩, 같은 시드는 같은 결과', () => {
    const s1 = createSeasonState(makeClubs(6, 7), 42);
    const s2 = createSeasonState(makeClubs(6, 7), 42);
    const r1 = playNext(s1);
    const r2 = playNext(s2);
    expect(r1.score).toEqual(r2.score);
    expect(totalRounds(s1)).toBe(10);
  });
});
