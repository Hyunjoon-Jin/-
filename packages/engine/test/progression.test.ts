import { describe, it, expect } from 'vitest';
import { ALL_ATTRS, type Attributes, type Club, type Player } from '../src/types.js';
import { progressPlayer } from '../src/progression.js';
import { currentAbility } from '../src/derived.js';
import { generateClub } from '../src/generate.js';
import { advanceSeason, runFranchise } from '../src/franchise.js';
import { Rng } from '../src/rng.js';

function makePlayer(opts: {
  attrVal: number; age: number; potential: number; contractYears?: number; id?: string;
}): Player {
  const attributes = {} as Attributes;
  for (const k of ALL_ATTRS) attributes[k] = opts.attrVal;
  return {
    id: opts.id ?? 'p1',
    name: 'Test',
    nationality: 'KOR',
    age: opts.age,
    position: 'MC',
    familiarity: { MC: 1 },
    attributes,
    potential: opts.potential,
    condition: 1,
    morale: 0.5,
    contractYears: opts.contractYears ?? 3,
    wage: 0,
  };
}

describe('progression: 성장/노화', () => {
  it('나이 +1, 잔여 계약 -1', () => {
    const rng = new Rng(1);
    const p = makePlayer({ attrVal: 12, age: 19, potential: 160, contractYears: 3 });
    progressPlayer(p, rng);
    expect(p.age).toBe(20);
    expect(p.contractYears).toBe(2);
  });

  it('잔여 계약은 0 미만으로 내려가지 않는다', () => {
    const rng = new Rng(1);
    const p = makePlayer({ attrVal: 12, age: 25, potential: 120, contractYears: 0 });
    progressPlayer(p, rng);
    expect(p.contractYears).toBe(0);
  });

  it('잠재력 갭이 큰 어린 선수는 CA가 오른다', () => {
    const rng = new Rng(42);
    const p = makePlayer({ attrVal: 9, age: 18, potential: 170 });
    const before = currentAbility(p);
    progressPlayer(p, rng);
    expect(currentAbility(p)).toBeGreaterThan(before);
  });

  it('여러 시즌 성장해도 잠재력을 크게 넘지 않는다', () => {
    const rng = new Rng(7);
    const p = makePlayer({ attrVal: 9, age: 17, potential: 150 });
    for (let i = 0; i < 8; i++) progressPlayer(p, rng);
    expect(currentAbility(p)).toBeLessThanOrEqual(p.potential + 6);
  });

  it('노장은 신체 능력·CA가 하락한다', () => {
    const rng = new Rng(3);
    const p = makePlayer({ attrVal: 15, age: 35, potential: 150 });
    const before = currentAbility(p);
    const paceBefore = p.attributes.pace;
    progressPlayer(p, rng);
    expect(currentAbility(p)).toBeLessThan(before);
    expect(p.attributes.pace).toBeLessThanOrEqual(paceBefore);
  });

  it('능력치는 항상 1~20 범위를 유지한다', () => {
    const rng = new Rng(9);
    const p = makePlayer({ attrVal: 1, age: 18, potential: 200 });
    for (let i = 0; i < 10; i++) progressPlayer(p, rng);
    for (const k of ALL_ATTRS) {
      expect(p.attributes[k]).toBeGreaterThanOrEqual(1);
      expect(p.attributes[k]).toBeLessThanOrEqual(20);
    }
  });
});

describe('franchise: 멀티시즌 루프', () => {
  function makeLeague(seed: number): Club[] {
    const rng = new Rng(seed);
    const clubs: Club[] = [];
    for (let i = 0; i < 10; i++) {
      const tier = 8 + Math.round((i / 9) * 8);
      clubs.push(generateClub(rng, `c${i}`, `C${i}`, tier));
    }
    return clubs;
  }

  it('시즌마다 우승팀이 정해지고 순위표가 완전하다', () => {
    const clubs = makeLeague(11);
    const summaries = runFranchise(clubs, 3, 500);
    expect(summaries).toHaveLength(3);
    for (const s of summaries) {
      expect(s.table).toHaveLength(clubs.length);
      expect(s.championId).toBe(s.table[0]!.clubId);
    }
  });

  it('은퇴는 유스로 1:1 충원되어 리그 전체 선수 수가 보존된다', () => {
    // 이적은 구단 간 선수를 재분배하므로 개별 구단 크기는 변하지만,
    // 은퇴=유스 충원이 1:1이라 리그 총원은 일정해야 한다.
    const clubs = makeLeague(22);
    const totalBefore = clubs.reduce((s, c) => s + c.players.length, 0);
    runFranchise(clubs, 6, 700);
    const totalAfter = clubs.reduce((s, c) => s + c.players.length, 0);
    expect(totalAfter).toBe(totalBefore);
    // 어떤 구단도 선발(11명) 아래로 줄지 않는다
    for (const c of clubs) expect(c.players.length).toBeGreaterThanOrEqual(11);
  });

  it('한 시즌 뒤 모든 선수의 나이가 1살 많아진다', () => {
    const clubs = makeLeague(33);
    const club = clubs[0]!;
    const agesBefore = new Map(club.players.map((p) => [p.id, p.age]));
    advanceSeason(clubs, 1, 900);
    // 이적/은퇴로 빠지지 않고 남아있는 선수만 검증
    for (const p of club.players) {
      const before = agesBefore.get(p.id);
      if (before !== undefined) expect(p.age).toBe(before + 1);
    }
  });

  it('같은 시드는 같은 우승 순서를 낸다 (재현성)', () => {
    const a = runFranchise(makeLeague(44), 4, 1234).map((s) => s.championId);
    const b = runFranchise(makeLeague(44), 4, 1234).map((s) => s.championId);
    expect(a).toEqual(b);
  });
});
