import { describe, it, expect } from 'vitest';
import { ALL_ATTRS, type Attributes, type Club, type Player } from '../src/types.js';
import { progressPlayer } from '../src/progression.js';
import { currentAbility } from '../src/derived.js';
import { generateClub } from '../src/generate.js';
import { advanceSeason, runFranchise, runOffseason } from '../src/franchise.js';
import { generateYouthPlayer } from '../src/generate.js';
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

  it('유스 아카데미·정리로 스쿼드가 상한 내로 유지되고, 리저브를 거쳐 유망주가 유입된다(B9)', () => {
    // 은퇴 + 아카데미 배출 + 상한 정리로 스쿼드는 상한(26) 내에서 유지되고,
    // 유스 인테이크는 1군이 아닌 리저브로 먼저 합류해 준비되면 승격된다.
    const clubs = makeLeague(22);
    runFranchise(clubs, 6, 700);
    let anyReserves = false;
    for (const c of clubs) {
      expect(c.players.length).toBeGreaterThanOrEqual(11);
      expect(c.players.length).toBeLessThanOrEqual(26);
      if ((c.reserves ?? []).some((p) => p.age <= 20)) anyReserves = true;
    }
    // 리그 전체로 보면 6시즌 동안 쌓인 유스 인테이크가 아직 승격 전 리저브에 존재한다.
    expect(anyReserves).toBe(true);
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

  it('골키퍼가 전원 없어지면 오프시즌 후 응급 유스 GK로 보강된다', () => {
    const rng = new Rng(5);
    const club = generateClub(rng, 'c', 'C', 12);
    club.players = club.players.filter((p) => p.position !== 'GK');
    expect(club.players.some((p) => p.position === 'GK')).toBe(false);
    runOffseason([club], new Rng(99));
    expect(club.players.some((p) => p.position === 'GK')).toBe(true);
  });

  it('전원 21세 미만이면 스쿼드가 상한을 넘어도 이번 시즌은 유스 보호를 위해 정리를 건너뛴다', () => {
    const rng = new Rng(6);
    const club = generateClub(rng, 'c', 'C', 12);
    for (const p of club.players) p.age = 17;
    let n = 0;
    while (club.players.length < 30) {
      club.players.push(generateYouthPlayer(new Rng(club.players.length + 100 + n++), 'MC', 12));
    }
    const before = club.players.length;
    expect(before).toBeGreaterThan(26); // SOFT_CAP
    runOffseason([club], new Rng(77));
    // established(21세 이상) 풀이 비어 있었으므로 은퇴도 정리도 없었어야 한다 —
    // 유스 유입만큼만 늘어나고(줄지 않고) 남아있어야 한다.
    expect(club.players.length).toBeGreaterThanOrEqual(before);
  });
});

describe('training: 훈련 포커스', () => {
  it('포커스 능력 그룹이 다른 포커스보다 더 성장한다', () => {
    // 동일 유망주를 finishing / defending 포커스로 각각 완만히 성장시켜 그룹 합 비교
    function grow(focus: 'finishing' | 'defending') {
      const rng = new Rng(1);
      const club = generateClub(rng, 'c', 'C', 12);
      const p = club.players[9]!; // ST
      p.age = 19; p.potential = 145; // 완만한 성장 여지
      for (const k in p.attributes) (p.attributes as Record<string, number>)[k] = 12;
      p.trainingFocus = focus;
      const growRng = new Rng(99);
      for (let i = 0; i < 4; i++) { p.age = 19 + i; progressPlayer(p, growRng, 12); }
      return p;
    }
    const fin = grow('finishing');
    const def = grow('defending');
    const finGroup = (p: typeof fin) =>
      p.attributes.finishing + p.attributes.shooting + p.attributes.composure + p.attributes.offTheBall;
    const defGroup = (p: typeof fin) =>
      p.attributes.tackling + p.attributes.marking + p.attributes.positioning + p.attributes.anticipation;
    expect(finGroup(fin)).toBeGreaterThan(finGroup(def));
    expect(defGroup(def)).toBeGreaterThan(defGroup(fin));
  });

  it('골키핑 포커스는 goalkicks를 강조한다(예전엔 positioning을 복붙해 배급 능력이 전혀 강조되지 않았음)', () => {
    function grow(focus: 'goalkeeping' | 'balanced') {
      const rng = new Rng(2);
      const club = generateClub(rng, 'c', 'C', 12);
      const gk = club.players.find((p) => p.position === 'GK')!;
      gk.age = 19; gk.potential = 145;
      for (const k in gk.attributes) (gk.attributes as Record<string, number>)[k] = 12;
      gk.trainingFocus = focus;
      const growRng = new Rng(88);
      for (let i = 0; i < 4; i++) { gk.age = 19 + i; progressPlayer(gk, growRng, 12); }
      return gk;
    }
    const focused = grow('goalkeeping');
    const balanced = grow('balanced');
    expect(focused.attributes.goalkicks).toBeGreaterThan(balanced.attributes.goalkicks);
  });
});
