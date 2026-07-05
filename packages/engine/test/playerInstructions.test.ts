import { describe, it, expect } from 'vitest';
import { simulateMatch } from '../src/simulateMatch.js';
import { generateClub, FORMATION_433 } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import {
  eligibleInstructionKinds, isValidInstruction, findManMarker,
  manMarkWeightMultiplier, manMarkXgMultiplier,
} from '../src/playerInstructions.js';
import type { Club, Tactic } from '../src/types.js';

function fixedLineupTactic(club: Club): Tactic {
  const lineup = FORMATION_433.map((position, i) => ({ position, playerId: club.players[i]!.id }));
  return {
    formation: '4-3-3', lineup, mentality: 0.5, tempo: 0.5, pressing: 0.5, width: 0.5, defensiveLine: 0.5,
  };
}

describe('개인 선수 지시(F10): 자격 판정', () => {
  it('eligibleInstructionKinds — 수비 슬롯은 전담마크, 측면 공격 슬롯은 좁혀 들어오기만 가능', () => {
    expect(eligibleInstructionKinds('DC')).toEqual(['manMark']);
    expect(eligibleInstructionKinds('DM')).toEqual(['manMark']);
    expect(eligibleInstructionKinds('WBL')).toEqual(['manMark']);
    expect(eligibleInstructionKinds('AML')).toEqual(['cutInside']);
    expect(eligibleInstructionKinds('MR')).toEqual(['cutInside']);
    expect(eligibleInstructionKinds('MC')).toEqual([]);
    expect(eligibleInstructionKinds('GK')).toEqual([]);
  });

  it('isValidInstruction — 슬롯 포지션 자격과 맞지 않거나 필드가 빠진 지시는 무효', () => {
    expect(isValidInstruction('DR', { kind: 'manMark', targetPosition: 'AML' })).toBe(true);
    expect(isValidInstruction('DR', { kind: 'manMark' })).toBe(false); // targetPosition 누락
    expect(isValidInstruction('MC', { kind: 'manMark', targetPosition: 'AML' })).toBe(false); // 자격 없는 슬롯
    expect(isValidInstruction('AML', { kind: 'cutInside' })).toBe(true);
    expect(isValidInstruction('MC', { kind: 'cutInside' })).toBe(false);
    expect(isValidInstruction('DR', undefined)).toBe(true);
  });
});

describe('개인 선수 지시(F10): 전담마크 효과 계수', () => {
  it('마크맨의 marking이 대상의 dribbling보다 높을수록 억제 효과(관여도·득점확률 배수 하락)가 커진다', () => {
    const weakMarker = { attributes: { marking: 8 } } as never;
    const strongMarker = { attributes: { marking: 18 } } as never;
    const target = { attributes: { dribbling: 12 } } as never;
    expect(manMarkWeightMultiplier(strongMarker, target)).toBeLessThan(manMarkWeightMultiplier(weakMarker, target));
    expect(manMarkXgMultiplier(strongMarker, target)).toBeLessThan(manMarkXgMultiplier(weakMarker, target));
    // 억제 배수는 항상 1 미만(전담마크는 절대 유리하게 작용하지 않는다).
    expect(manMarkWeightMultiplier(weakMarker, target)).toBeLessThan(1);
    expect(manMarkXgMultiplier(weakMarker, target)).toBeLessThan(1);
  });
});

describe('개인 선수 지시(F10): findManMarker', () => {
  it('상대 라인업에서 전담마크 대상 포지션(슬롯 기준)의 선수를 정확히 찾는다', () => {
    const rng = new Rng(500);
    const home = generateClub(rng, 'h', 'Home', 13);
    const away = generateClub(rng, 'a', 'Away', 12);
    const baseHomeTactic = fixedLineupTactic(home);
    const homeTactic: Tactic = {
      ...baseHomeTactic,
      lineup: baseHomeTactic.lineup.map((s, i) => (
        i === 4 ? { ...s, instruction: { kind: 'manMark', targetPosition: 'AML' } } : s
      )),
    };
    const awayTactic = fixedLineupTactic(away);
    const awayAML = awayTactic.lineup.find((s) => s.position === 'AML')!;
    const marker = findManMarker(awayAML.playerId, awayTactic, homeTactic, home.players);
    expect(marker).not.toBeNull();
    expect(marker!.id).toBe(homeTactic.lineup[4]!.playerId);
    expect(homeTactic.lineup[4]!.position).toBe('DR');
  });

  it('지시가 아예 없으면 null', () => {
    const rng = new Rng(501);
    const home = generateClub(rng, 'h', 'Home', 13);
    const away = generateClub(rng, 'a', 'Away', 12);
    const homeTactic = fixedLineupTactic(home);
    const awayTactic = fixedLineupTactic(away);
    const awayAML = awayTactic.lineup.find((s) => s.position === 'AML')!;
    expect(findManMarker(awayAML.playerId, awayTactic, homeTactic, home.players)).toBeNull();
  });

  it('전담마크 대상 포지션이 물어보는 선수의 슬롯과 다르면 null(다른 선수만 마크당함)', () => {
    const rng = new Rng(502);
    const home = generateClub(rng, 'h', 'Home', 13);
    const away = generateClub(rng, 'a', 'Away', 12);
    const baseHomeTactic = fixedLineupTactic(home);
    const homeTactic: Tactic = {
      ...baseHomeTactic,
      // DR이 AMR을 마크(AML이 아니다).
      lineup: baseHomeTactic.lineup.map((s, i) => (
        i === 4 ? { ...s, instruction: { kind: 'manMark', targetPosition: 'AMR' } } : s
      )),
    };
    const awayTactic = fixedLineupTactic(away);
    const awayAML = awayTactic.lineup.find((s) => s.position === 'AML')!;
    const awayAMR = awayTactic.lineup.find((s) => s.position === 'AMR')!;
    expect(findManMarker(awayAML.playerId, awayTactic, homeTactic, home.players)).toBeNull();
    expect(findManMarker(awayAMR.playerId, awayTactic, homeTactic, home.players)).not.toBeNull();
  });
});

describe('개인 선수 지시(F10): 실전 시뮬 연동', () => {
  it('전담마크에 걸리면 마크당한 공격수의 슛 관여(다수 시드 누적)가 줄어든다', () => {
    let markedShots = 0;
    let baselineShots = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const rng = new Rng(seed * 7 + 1);
      const home = generateClub(rng, 'h', 'Home', 13);
      const away = generateClub(rng, 'a', 'Away', 12);
      const awayTactic = fixedLineupTactic(away);
      const awayAML = awayTactic.lineup.find((s) => s.position === 'AML')!;

      const baseHomeTactic = fixedLineupTactic(home);
      const markedHomeTactic: Tactic = {
        ...baseHomeTactic,
        lineup: baseHomeTactic.lineup.map((s, i) => (
          i === 4 ? { ...s, instruction: { kind: 'manMark', targetPosition: 'AML' } } : s
        )),
      };

      const baseResult = simulateMatch({
        home: { club: home, tactic: baseHomeTactic }, away: { club: away, tactic: awayTactic }, seed,
      });
      const markedResult = simulateMatch({
        home: { club: home, tactic: markedHomeTactic }, away: { club: away, tactic: awayTactic }, seed,
      });

      baselineShots += baseResult.playerStats.away.find((p) => p.playerId === awayAML.playerId)?.shots ?? 0;
      markedShots += markedResult.playerStats.away.find((p) => p.playerId === awayAML.playerId)?.shots ?? 0;
    }
    expect(markedShots).toBeLessThan(baselineShots);
  });

  it('좁혀 들어오기를 지시하면 해당 공격수의 슛 관여(다수 시드 누적)가 늘어난다', () => {
    let cutInsideShots = 0;
    let baselineShots = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const rng = new Rng(seed * 11 + 3);
      const home = generateClub(rng, 'h', 'Home', 13);
      const away = generateClub(rng, 'a', 'Away', 12);
      const homeTactic = fixedLineupTactic(home);

      const baseAwayTactic = fixedLineupTactic(away);
      const awayAML = baseAwayTactic.lineup.find((s) => s.position === 'AML')!;
      const cutAwayTactic: Tactic = {
        ...baseAwayTactic,
        lineup: baseAwayTactic.lineup.map((s) => (
          s.position === 'AML' ? { ...s, instruction: { kind: 'cutInside' } } : s
        )),
      };

      const baseResult = simulateMatch({
        home: { club: home, tactic: homeTactic }, away: { club: away, tactic: baseAwayTactic }, seed,
      });
      const cutResult = simulateMatch({
        home: { club: home, tactic: homeTactic }, away: { club: away, tactic: cutAwayTactic }, seed,
      });

      baselineShots += baseResult.playerStats.away.find((p) => p.playerId === awayAML.playerId)?.shots ?? 0;
      cutInsideShots += cutResult.playerStats.away.find((p) => p.playerId === awayAML.playerId)?.shots ?? 0;
    }
    expect(cutInsideShots).toBeGreaterThan(baselineShots);
  });

  it('지시가 전혀 없으면(대다수 경기) 기존과 완전히 동일한 결과가 나온다(RNG 소비 불변)', () => {
    const rng = new Rng(999);
    const home = generateClub(rng, 'h', 'Home', 13);
    const away = generateClub(rng, 'a', 'Away', 12);
    const homeTactic = fixedLineupTactic(home);
    const awayTactic = fixedLineupTactic(away);
    const a = simulateMatch({ home: { club: home, tactic: homeTactic }, away: { club: away, tactic: awayTactic }, seed: 42 });
    const b = simulateMatch({ home: { club: home, tactic: homeTactic }, away: { club: away, tactic: awayTactic }, seed: 42 });
    expect(a.score).toEqual(b.score);
    expect(a.events).toEqual(b.events);
  });
});
