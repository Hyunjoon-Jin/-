import { describe, it, expect } from 'vitest';
import { generateClub, generateYouthPlayer, defaultTactic } from '../src/generate.js';
import { applyMatchEffects } from '../src/matchEffects.js';
import { progressPlayer } from '../src/progression.js';
import { runOffseason } from '../src/franchise.js';
import { playerDerived, currentAbility } from '../src/derived.js';
import { hasTrait, rollTraits } from '../src/traits.js';
import { simulateMatch } from '../src/simulateMatch.js';
import { Rng } from '../src/rng.js';
import type { Club, MatchResult, Player, PlayerTrait } from '../src/types.js';

function fakeResult(home: Club, away: Club, hg: number, ag: number): MatchResult {
  return {
    homeClubId: home.id, awayClubId: away.id,
    homeClubName: home.name, awayClubName: away.name,
    score: [hg, ag], possession: [50, 50], shots: [0, 0],
    events: [], cards: [], injuries: [], playerStats: { home: [], away: [] }, seed: 1,
  };
}

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

describe('traits: 생성·부여 규칙', () => {
  it('철강왕과 유리몸을 동시에 갖지 않고, 최대 2개까지만 부여된다', () => {
    const rng = new Rng(7);
    const clubs: Club[] = [];
    for (let i = 0; i < 8; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 8 + i));
    const all = clubs.flatMap((c) => c.players);
    let withTrait = 0;
    for (const p of all) {
      expect(p.traits.length).toBeLessThanOrEqual(2);
      expect(hasTrait(p, 'ironMan') && hasTrait(p, 'injuryProne')).toBe(false);
      if (p.traits.length > 0) withTrait++;
    }
    // 다수 선수 중 특성 보유자가 존재한다(0이면 확률/생성 버그).
    expect(withTrait).toBeGreaterThan(0);
  });

  it('hasTrait는 traits 미설정(구세이브)에도 안전하다', () => {
    const p = { traits: undefined } as unknown as Player;
    expect(hasTrait(p, 'leader')).toBe(false);
  });

  it('동일 시드면 동일 특성 (재현성)', () => {
    const a = generateClub(new Rng(3), 'c', 'C', 13);
    const b = generateClub(new Rng(3), 'c', 'C', 13);
    expect(a.players.map((p) => p.traits.join(',')))
      .toEqual(b.players.map((p) => p.traits.join(',')));
  });
});

describe('traits: 파생 전력 보정', () => {
  function derivedFor(trait: PlayerTrait | null, key: 'attack' | 'creation' | 'defense'): number {
    const base = generateYouthPlayer(new Rng(4), 'MC', 14);
    const p = clone(base);
    p.traits = trait ? [trait] : [];
    return playerDerived(p, p.position)[key];
  }

  it('골잡이는 공격 전력을 올린다', () => {
    expect(derivedFor('poacher', 'attack')).toBeGreaterThan(derivedFor(null, 'attack'));
  });
  it('플레이메이커는 창출 전력을 올린다', () => {
    expect(derivedFor('playmaker', 'creation')).toBeGreaterThan(derivedFor(null, 'creation'));
  });
  it('수비 바위는 수비 전력을 올린다', () => {
    expect(derivedFor('rock', 'defense')).toBeGreaterThan(derivedFor(null, 'defense'));
  });
});

describe('traits: 부상·피로 보정', () => {
  // 부상은 simulateMatch가 판정(result.injuries)하므로 시드를 바꿔가며 이벤트 수를 집계.
  function injuryEventCount(trait: PlayerTrait | null, runs: number): number {
    const rng = new Rng(5);
    const home = generateClub(rng, 'h', 'H', 13);
    const away = generateClub(rng, 'a', 'A', 13);
    for (const p of home.players) p.traits = trait ? [trait] : [];
    const ht = defaultTactic(home);
    const at = defaultTactic(away);
    let count = 0;
    for (let i = 0; i < runs; i++) {
      const result = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed: 2000 + i });
      count += result.injuries.filter((e) => e.side === 'home').length;
    }
    return count;
  }

  it('유리몸은 철강왕보다 부상 이벤트가 더 잦다', () => {
    const prone = injuryEventCount('injuryProne', 1000);
    const iron = injuryEventCount('ironMan', 1000);
    expect(prone).toBeGreaterThan(iron);
  });

  it('철강왕은 피로 소모가 적다', () => {
    const rng = new Rng(6);
    const home = generateClub(rng, 'h', 'H', 13);
    const away = generateClub(rng, 'a', 'A', 13);
    const ht = defaultTactic(home);
    const at = defaultTactic(away);
    const starterId = ht.lineup[5]!.playerId;
    const starter = home.players.find((p) => p.id === starterId)!;

    const normal = clone(starter); normal.traits = [];
    const iron = clone(starter); iron.traits = ['ironMan'];
    // 각각 대체해 한 경기 효과 적용 후 컨디션 비교
    const run = (variant: Player): number => {
      home.players = home.players.map((p) => (p.id === variant.id ? clone(variant) : p));
      const target = home.players.find((p) => p.id === variant.id)!;
      target.condition = 1;
      applyMatchEffects(home, ht, away, at, fakeResult(home, away, 0, 0), new Rng(99));
      return target.condition;
    };
    expect(run(iron)).toBeGreaterThan(run(normal));
  });
});

describe('traits: 성장·카드·사기', () => {
  it('특급 유망주는 성장 속도가 빠르다', () => {
    const base = generateYouthPlayer(new Rng(3), 'ST', 12);
    base.age = 18;
    base.potential = 190;
    const normal = clone(base); normal.traits = [];
    const wonder = clone(base); wonder.traits = ['wonderkid'];
    progressPlayer(normal, new Rng(1));
    progressPlayer(wonder, new Rng(1));
    expect(currentAbility(wonder)).toBeGreaterThan(currentAbility(normal));
  });

  it('다혈질은 카드를 더 자주 받는다', () => {
    const cardsFor = (trait: PlayerTrait | null, runs: number): number => {
      const rng = new Rng(8);
      const home = generateClub(rng, 'h', 'H', 12);
      const away = generateClub(rng, 'a', 'A', 12);
      for (const p of home.players) p.traits = trait ? [trait] : [];
      const ht = defaultTactic(home);
      const at = defaultTactic(away);
      const ids = new Set(ht.lineup.map((s) => s.playerId));
      let total = 0;
      for (let i = 0; i < runs; i++) {
        const r = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed: 500 + i });
        total += r.cards.filter((c) => ids.has(c.playerId)).length;
      }
      return total;
    };
    expect(cardsFor('hothead', 300)).toBeGreaterThan(cardsFor(null, 300));
  });

  it('리더가 있으면 스쿼드 사기가 더 높다', () => {
    const clubA = generateClub(new Rng(11), 'c', 'C', 12);
    const clubB = clone(clubA);
    for (const p of clubA.players) { p.traits = []; p.seasonApps = 4; }
    for (const p of clubB.players) { p.traits = []; p.seasonApps = 4; }
    clubB.players[0]!.traits = ['leader'];
    runOffseason([clubA], new Rng(1));
    runOffseason([clubB], new Rng(1));
    // 리더가 아닌 동일 인덱스 선수의 사기 비교(리더 보너스만 차이).
    expect(clubB.players[1]!.morale).toBeGreaterThan(clubA.players[1]!.morale);
  });
});
