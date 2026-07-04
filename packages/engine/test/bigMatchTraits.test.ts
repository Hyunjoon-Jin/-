import { describe, it, expect } from 'vitest';
import { playerDerived } from '../src/derived.js';
import { computeTeamStrength } from '../src/teamStrength.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Player } from '../src/types.js';

/**
 * 빅게임 히어로/새가슴 특성(Phase 5 교차 스윕) 회귀 테스트 — 예전엔 isBigMatch가
 * AI 전술 선택(멘탈리티·압박 등)에만 쓰이고 선수 개인 파생 능력치에는 전혀 닿지
 * 않았다. 이제 큰 경기에서만 두 특성이 실제로 파생 능력치를 오르내리게 하는지,
 * 평범한 경기에서는 아무 영향이 없는지 검증한다.
 */
function makePlayer(seed: number): Player {
  const rng = new Rng(seed);
  const club = generateClub(rng, 'c', 'C', 13);
  return club.players.find((p) => p.position !== 'GK')!;
}

describe('빅게임 히어로/새가슴 특성', () => {
  it('빅게임 히어로는 빅매치에서만 파생 능력치가 오른다', () => {
    const player = makePlayer(1);
    player.traits = ['bigGameHero'];
    const normal = playerDerived(player, player.position, false);
    const big = playerDerived(player, player.position, true);
    expect(big.attack).toBeGreaterThan(normal.attack);
    expect(big.defense).toBeGreaterThan(normal.defense);
  });

  it('새가슴은 빅매치에서만 파생 능력치가 떨어진다', () => {
    const player = makePlayer(2);
    player.traits = ['bigGameChoker'];
    const normal = playerDerived(player, player.position, false);
    const big = playerDerived(player, player.position, true);
    expect(big.attack).toBeLessThan(normal.attack);
    expect(big.defense).toBeLessThan(normal.defense);
  });

  it('두 특성이 없으면 isBigMatch 여부와 무관하게 파생 능력치가 같다', () => {
    const player = makePlayer(3);
    player.traits = [];
    const normal = playerDerived(player, player.position, false);
    const big = playerDerived(player, player.position, true);
    expect(big.attack).toBeCloseTo(normal.attack, 9);
    expect(big.creation).toBeCloseTo(normal.creation, 9);
  });

  it('빅매치 팀 전력 산출(computeTeamStrength)에도 동일하게 반영된다', () => {
    const rng = new Rng(4);
    const club = generateClub(rng, 'c', 'C', 13);
    for (const p of club.players) p.traits = ['bigGameHero'];
    const tactic = defaultTactic(club);
    const normal = computeTeamStrength(club, tactic, false);
    const big = computeTeamStrength(club, tactic, true);
    expect(big.attack).toBeGreaterThan(normal.attack);
  });
});

describe('폼 기반 AI 위험 성향', () => {
  it('연패 중(낮은 승점)이면 중립 대비 더 공격적인 멘탈리티를 낸다', () => {
    const club = generateClub(new Rng(10), 'c', 'C', 13);
    const opponent = generateClub(new Rng(11), 'o', 'O', 13);
    const neutral = defaultTactic(club, { opponent }).mentality;
    const losingStreak = defaultTactic(club, { opponent, recentFormPoints: 0 }).mentality;
    expect(losingStreak).toBeGreaterThan(neutral);
  });

  it('연승 중(높은 승점)이면 중립 대비 더 신중한 멘탈리티를 낸다', () => {
    const club = generateClub(new Rng(12), 'c', 'C', 13);
    const opponent = generateClub(new Rng(13), 'o', 'O', 13);
    const neutral = defaultTactic(club, { opponent }).mentality;
    const winningStreak = defaultTactic(club, { opponent, recentFormPoints: 15 }).mentality;
    expect(winningStreak).toBeLessThan(neutral);
  });

  it('recentFormPoints를 넘기지 않으면(기존 호출부) 동작이 그대로다', () => {
    const club = generateClub(new Rng(14), 'c', 'C', 13);
    const opponent = generateClub(new Rng(15), 'o', 'O', 13);
    const a = defaultTactic(club, { opponent }).mentality;
    const b = defaultTactic(club, { opponent }).mentality;
    expect(a).toBeCloseTo(b, 9);
  });

  it('멘탈리티는 항상 유효 범위([0,1]) 안에 있다', () => {
    const club = generateClub(new Rng(16), 'c', 'C', 20);
    const opponent = generateClub(new Rng(17), 'o', 'O', 1);
    const m = defaultTactic(club, { opponent, recentFormPoints: 0, isHome: false }).mentality;
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThanOrEqual(1);
  });
});
