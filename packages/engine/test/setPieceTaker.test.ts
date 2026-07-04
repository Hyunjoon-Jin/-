import { describe, it, expect } from 'vitest';
import { simulateMatch } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { lineOf } from '../src/teamStrength.js';
import { hasTrait } from '../src/traits.js';
import { Rng } from '../src/rng.js';
import type { Club, Player, Tactic } from '../src/types.js';

/** 전담자 자동 선정 점수 — 세트피스 스페셜리스트 특성이 있으면 가산(엔진 로직과 동일). */
function setPieceTakerScore(p: Player): number {
  return p.attributes.setPiece + (hasTrait(p, 'setPieceSpecialist') ? 3 : 0);
}

/**
 * 세트피스 전담자(Track 5) 회귀 테스트 — 예전엔 세트피스 상황도 다른 슈팅 기회와
 * 똑같이 라인업(공격+미드필더) 중 완전 무작위로 슈터를 뽑았다. 전담자를 지정하면
 * 세트피스 상황의 상당수를 그 선수가 직접 맡는지, 오픈플레이/크로스에는 영향이
 * 없는지, 자동 지정이 세트피스 능력치 기준으로 이뤄지는지 검증한다.
 */
function matchup(seed = 1) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

function shooterShareByChance(
  home: Club, away: Club, ht: Tactic, at: Tactic, takerId: string, seeds: number,
): Record<string, { taker: number; total: number }> {
  const byChance: Record<string, { taker: number; total: number }> = {
    open: { taker: 0, total: 0 }, cross: { taker: 0, total: 0 }, setpiece: { taker: 0, total: 0 },
  };
  for (let s = 0; s < seeds; s++) {
    const result = simulateMatch({
      home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed: s + 90000,
    });
    for (const ev of result.events) {
      if (ev.side !== 'home') continue;
      byChance[ev.chanceType]!.total++;
      if (ev.playerId === takerId) byChance[ev.chanceType]!.taker++;
    }
  }
  return byChance;
}

describe('세트피스 전담자: 자동 지정', () => {
  it('defaultTactic은 라인업(공격+미드필더) 중 세트피스 능력치가 가장 높은 선수를 전담자로 고른다', () => {
    const rng = new Rng(500);
    const club = generateClub(rng, 'c', 'C', 13);
    const tactic = defaultTactic(club);
    const byId = new Map(club.players.map((p) => [p.id, p]));
    const eligible = tactic.lineup
      .filter((s) => lineOf(s.position) === 'ATT' || lineOf(s.position) === 'MID')
      .map((s) => byId.get(s.playerId)!);
    const best = [...eligible].sort((a, b) => setPieceTakerScore(b) - setPieceTakerScore(a))[0]!;
    expect(tactic.setPieceTakerId).toBe(best.id);
  });

  it('전담자를 라인업 밖 선수로 강제 지정해도(잘못된 상태) 충돌 없이 무작위 슈팅으로 대체된다', () => {
    const { home, away, ht, at } = matchup(501);
    const broken = { ...ht, setPieceTakerId: 'nonexistent-id' };
    expect(() => simulateMatch({
      home: { club: home, tactic: broken }, away: { club: away, tactic: at }, seed: 1,
    })).not.toThrow();
  });
});

describe('세트피스 전담자: 슈터 선택 가중치', () => {
  it('전담자가 지정되면 세트피스 상황의 상당수를 그 선수가 직접 맡는다', () => {
    const { home, away, ht, at } = matchup(502);
    const takerId = ht.lineup.find((s) => lineOf(s.position) === 'ATT' || lineOf(s.position) === 'MID')!.playerId;
    const tactic = { ...ht, setPieceTakerId: takerId };
    const byChance = shooterShareByChance(home, away, tactic, at, takerId, 200);
    expect(byChance.setpiece!.total).toBeGreaterThan(20);
    const share = byChance.setpiece!.taker / byChance.setpiece!.total;
    expect(share).toBeGreaterThan(0.35);
  });

  it('전담자를 지정하지 않으면(예전 동작) 세트피스 슈터도 무작위로 고르게 분산된다', () => {
    const { home, away, ht, at } = matchup(503);
    const takerId = ht.lineup.find((s) => lineOf(s.position) === 'ATT' || lineOf(s.position) === 'MID')!.playerId;
    const tactic = { ...ht, setPieceTakerId: undefined };
    const byChance = shooterShareByChance(home, away, tactic, at, takerId, 200);
    expect(byChance.setpiece!.total).toBeGreaterThan(20);
    const share = byChance.setpiece!.taker / byChance.setpiece!.total;
    expect(share).toBeLessThan(0.3);
  });

  it('전담자 지정은 오픈플레이·크로스 상황의 슈터 분포에는 영향을 주지 않는다', () => {
    const { home, away, ht, at } = matchup(504);
    const takerId = ht.lineup.find((s) => lineOf(s.position) === 'ATT' || lineOf(s.position) === 'MID')!.playerId;
    const withTaker = shooterShareByChance(home, away, { ...ht, setPieceTakerId: takerId }, at, takerId, 200);
    const withoutTaker = shooterShareByChance(home, away, { ...ht, setPieceTakerId: undefined }, at, takerId, 200);
    expect(withTaker.open!.total).toBeGreaterThan(20);
    expect(withTaker.cross!.total).toBeGreaterThan(20);
    const openShareWith = withTaker.open!.taker / withTaker.open!.total;
    const openShareWithout = withoutTaker.open!.taker / withoutTaker.open!.total;
    const crossShareWith = withTaker.cross!.taker / withTaker.cross!.total;
    const crossShareWithout = withoutTaker.cross!.taker / withoutTaker.cross!.total;
    expect(Math.abs(openShareWith - openShareWithout)).toBeLessThan(0.1);
    expect(Math.abs(crossShareWith - crossShareWithout)).toBeLessThan(0.1);
  });
});
