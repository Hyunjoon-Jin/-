import { describe, it, expect } from 'vitest';
import { applyMatchEffects } from '../src/matchEffects.js';
import { progressPlayer } from '../src/progression.js';
import { familiarityAt } from '../src/derived.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club, MatchResult, Player, Position, Tactic } from '../src/types.js';

/**
 * 포지션 숙련도 성장 시스템(Track 3) 회귀 테스트 — 예전엔 familiarity가 생성 시점에
 * 고정된 죽은 데이터였다. (1) 부 포지션으로 실전을 뛰면 서서히, (2) 포지션 전환 훈련을
 * 지정하면 코칭 지원을 받아 훨씬 빠르게 오르는지, 판단력·멀티롤 유망주 특성이 속도를
 * 좌우하는지 검증한다.
 */
function fakeResult(home: Club, away: Club): MatchResult {
  return {
    homeClubId: home.id, awayClubId: away.id,
    homeClubName: home.name, awayClubName: away.name,
    score: [0, 0], possession: [50, 50], shots: [0, 0],
    events: [], cards: [], injuries: [], playerStats: { home: [], away: [] }, seed: 1,
  };
}

function setup() {
  const rng = new Rng(50);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 13);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

/** tactic의 라인업에서 slot을 강제로 바꿔 특정 선수를 부 포지션에 배치한다. */
function forceOutOfPosition(tactic: Tactic, player: Player, slot: Position): Tactic {
  const lineup = tactic.lineup.map((s) => (s.playerId === player.id ? { ...s, position: slot } : s));
  return { ...tactic, lineup };
}

function pickNonGk(club: Club): Player {
  return club.players.find((p) => p.position !== 'GK')!;
}

describe('포지션 숙련도: 실전 기반 자연 성장', () => {
  it('부 포지션으로 여러 경기를 뛰면 해당 포지션 숙련도가 서서히 오른다', () => {
    const { home, away, ht, at } = setup();
    const player = pickNonGk(home);
    const slot: Position = player.position === 'ST' ? 'MC' : 'ST';
    const tactic = forceOutOfPosition(ht, player, slot);
    const before = familiarityAt(player, slot);
    for (let i = 0; i < 20; i++) {
      applyMatchEffects(home, tactic, away, at, fakeResult(home, away), new Rng(i));
    }
    expect(familiarityAt(player, slot)).toBeGreaterThan(before);
  });

  it('주 포지션으로 뛰면 숙련도가 변하지 않는다(이미 1.0)', () => {
    const { home, away, ht, at } = setup();
    const player = home.players.find((p) => p.id === ht.lineup[0]!.playerId)!;
    applyMatchEffects(home, ht, away, at, fakeResult(home, away), new Rng(1));
    expect(familiarityAt(player, player.position)).toBe(1);
  });

  it('판단력(decisions)이 높을수록 자연 성장 속도가 빠르다', () => {
    const a = setup();
    const b = setup();
    const playerA = pickNonGk(a.home);
    const playerB = b.home.players.find((p) => p.id === playerA.id)!;
    const slot: Position = playerA.position === 'ST' ? 'MC' : 'ST';
    playerA.attributes.decisions = 20;
    playerB.attributes.decisions = 1;
    const tacticA = forceOutOfPosition(a.ht, playerA, slot);
    const tacticB = forceOutOfPosition(b.ht, playerB, slot);
    for (let i = 0; i < 10; i++) {
      applyMatchEffects(a.home, tacticA, a.away, a.at, fakeResult(a.home, a.away), new Rng(i));
      applyMatchEffects(b.home, tacticB, b.away, b.at, fakeResult(b.home, b.away), new Rng(i));
    }
    expect(familiarityAt(playerA, slot)).toBeGreaterThan(familiarityAt(playerB, slot));
  });

  it('숙련도는 1을 넘지 않는다', () => {
    const { home, away, ht, at } = setup();
    const player = pickNonGk(home);
    const slot: Position = player.position === 'ST' ? 'MC' : 'ST';
    player.familiarity[slot] = 0.999;
    const tactic = forceOutOfPosition(ht, player, slot);
    for (let i = 0; i < 50; i++) {
      applyMatchEffects(home, tactic, away, at, fakeResult(home, away), new Rng(i));
    }
    expect(familiarityAt(player, slot)).toBeLessThanOrEqual(1);
  });
});

describe('포지션 숙련도: 코칭 지원 전환 훈련', () => {
  it('trainingPosition을 지정하면 시즌 경계마다 해당 포지션 숙련도가 오른다', () => {
    const rng = new Rng(60);
    const club = generateClub(rng, 'c', 'C', 13);
    const player = pickNonGk(club);
    const slot: Position = player.position === 'ST' ? 'MC' : 'ST';
    player.trainingPosition = slot;
    const before = familiarityAt(player, slot);
    progressPlayer(player, rng, 10);
    expect(familiarityAt(player, slot)).toBeGreaterThan(before);
  });

  it('trainingPosition을 지정하지 않으면 숙련도가 그대로다', () => {
    const rng = new Rng(61);
    const club = generateClub(rng, 'c', 'C', 13);
    const player = pickNonGk(club);
    const slot: Position = player.position === 'ST' ? 'MC' : 'ST';
    const before = familiarityAt(player, slot);
    progressPlayer(player, rng, 10);
    expect(familiarityAt(player, slot)).toBe(before);
  });

  it('코칭 레벨이 높을수록 전환 훈련 성장 속도가 빠르다', () => {
    const club = generateClub(new Rng(62), 'c', 'C', 13);
    const playerA = pickNonGk(club);
    const playerB: Player = JSON.parse(JSON.stringify(playerA));
    const slot: Position = playerA.position === 'ST' ? 'MC' : 'ST';
    playerA.trainingPosition = slot;
    playerB.trainingPosition = slot;
    progressPlayer(playerA, new Rng(1), 20);
    progressPlayer(playerB, new Rng(1), 1);
    expect(familiarityAt(playerA, slot)).toBeGreaterThan(familiarityAt(playerB, slot));
  });

  it('전환 훈련은 실전 자연 성장보다 훨씬 빠르다(시즌 1회 vs 경기 1회 비교가 아닌, 동일 조건 비교)', () => {
    const club = generateClub(new Rng(63), 'c', 'C', 13);
    const player = pickNonGk(club);
    const slot: Position = player.position === 'ST' ? 'MC' : 'ST';
    player.trainingPosition = slot;
    progressPlayer(player, new Rng(1), 10);
    const trainingGain = familiarityAt(player, slot) - 0.2;

    const { home, away, ht, at } = setup();
    const matchPlayer = pickNonGk(home);
    const matchSlot: Position = matchPlayer.position === 'ST' ? 'MC' : 'ST';
    matchPlayer.attributes.decisions = player.attributes.decisions;
    const tactic = forceOutOfPosition(ht, matchPlayer, matchSlot);
    applyMatchEffects(home, tactic, away, at, fakeResult(home, away), new Rng(1));
    const matchGain = familiarityAt(matchPlayer, matchSlot) - 0.2;

    expect(trainingGain).toBeGreaterThan(matchGain * 5);
  });

  it('멀티롤 유망주 특성이 있으면 전환 훈련·실전 성장 모두 더 빠르다', () => {
    const club = generateClub(new Rng(64), 'c', 'C', 13);
    const playerA = pickNonGk(club);
    const playerB: Player = JSON.parse(JSON.stringify(playerA));
    const slot: Position = playerA.position === 'ST' ? 'MC' : 'ST';
    playerA.traits = ['multiRole'];
    playerB.traits = [];
    playerA.trainingPosition = slot;
    playerB.trainingPosition = slot;
    progressPlayer(playerA, new Rng(1), 10);
    progressPlayer(playerB, new Rng(1), 10);
    expect(familiarityAt(playerA, slot)).toBeGreaterThan(familiarityAt(playerB, slot));
  });

  it('숙련도는 0~1 범위를 벗어나지 않는다', () => {
    const club = generateClub(new Rng(65), 'c', 'C', 13);
    const player = pickNonGk(club);
    const slot: Position = player.position === 'ST' ? 'MC' : 'ST';
    player.trainingPosition = slot;
    player.familiarity[slot] = 0.999;
    for (let i = 0; i < 30; i++) progressPlayer(player, new Rng(i), 20);
    const v = familiarityAt(player, slot);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});
