import { describe, it, expect } from 'vitest';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import { decideAiHalftimeTactic, simulateMatchWithAiTactics, decideConditionRotation } from '../src/aiInMatch.js';
import { simulateMatch } from '../src/simulateMatch.js';
import { LiveMatch, HALF_TIME } from '../src/liveMatch.js';
import type { Club, InjuryEvent, MatchSetup, Tactic } from '../src/types.js';

function makeClub(seed: number, tier = 13) {
  const rng = new Rng(seed);
  return generateClub(rng, 'c', 'C', tier);
}

function injuryFor(club: Club, tactic: Tactic): InjuryEvent {
  const slot = tactic.lineup.find((s) => s.position !== 'GK')!;
  const p = club.players.find((pl) => pl.id === slot.playerId)!;
  return {
    minute: 20, side: 'home', playerId: p.id, playerName: p.name,
    severity: 'moderate', name: '햄스트링 부상', bodyPart: 'hamstring', matches: 4,
  };
}

describe('F09: 스코어라인 기반 반응형 전술', () => {
  it('하프타임에 지고 있으면 추격 모드(공격적 슬라이더)로 바뀐다', () => {
    const club = makeClub(1);
    const tactic = defaultTactic(club);
    const next = decideAiHalftimeTactic(club, tactic, 0, 1, []);
    expect(next).not.toBeNull();
    expect(next!.mentality).toBeGreaterThan(tactic.mentality);
    expect(next!.tempo).toBeGreaterThan(tactic.tempo);
  });

  it('2골 이상 앞서면 리드 지키기(안정적 슬라이더)로 바뀐다', () => {
    const club = makeClub(2);
    const tactic = defaultTactic(club);
    const next = decideAiHalftimeTactic(club, tactic, 2, 0, []);
    expect(next).not.toBeNull();
    expect(next!.mentality).toBeLessThan(tactic.mentality);
  });

  it('무승부이거나 1골 차로 앞서면 전술을 바꾸지 않는다(부상도 없을 때)', () => {
    const club = makeClub(3);
    const tactic = defaultTactic(club);
    expect(decideAiHalftimeTactic(club, tactic, 0, 0, [])).toBeNull();
    expect(decideAiHalftimeTactic(club, tactic, 1, 0, [])).toBeNull();
  });
});

describe('F01: 하프타임 부상 교체', () => {
  it('전반 중 부상당한 선발을 같은 슬롯의 벤치 자원으로 교체한다', () => {
    const club = makeClub(4);
    const tactic = defaultTactic(club);
    const injury = injuryFor(club, tactic);
    const next = decideAiHalftimeTactic(club, tactic, 0, 0, [injury]);
    expect(next).not.toBeNull();
    const slot = next!.lineup.find((s) => s.position === tactic.lineup.find((o) => o.playerId === injury.playerId)!.position);
    expect(next!.lineup.some((s) => s.playerId === injury.playerId)).toBe(false);
    expect(slot).toBeDefined();
    expect(next!.lineup.length).toBe(tactic.lineup.length);
  });

  it('벤치 자원이 전혀 없으면(전원 출전 중) 교체하지 않는다', () => {
    const club = makeClub(5);
    const tactic = defaultTactic(club);
    // 라인업 밖 전원을 결장 처리해 벤치를 고갈시킨다.
    const lineupIds = new Set(tactic.lineup.map((s) => s.playerId));
    for (const p of club.players) {
      if (!lineupIds.has(p.id)) p.injuryMatches = 3;
    }
    const injury = injuryFor(club, tactic);
    const next = decideAiHalftimeTactic(club, tactic, 0, 0, [injury]);
    expect(next).toBeNull();
  });

  it('부상 교체와 반응형 전술이 함께 적용될 수 있다', () => {
    const club = makeClub(6);
    const tactic = defaultTactic(club);
    const injury = injuryFor(club, tactic);
    const next = decideAiHalftimeTactic(club, tactic, 0, 1, [injury]);
    expect(next).not.toBeNull();
    expect(next!.lineup.some((s) => s.playerId === injury.playerId)).toBe(false);
    expect(next!.mentality).toBeGreaterThan(tactic.mentality);
  });
});

describe('simulateMatchWithAiTactics', () => {
  function setup(seed: number): MatchSetup {
    const rng = new Rng(seed);
    const home = generateClub(rng, 'h', 'Home', 14);
    const away = generateClub(rng, 'a', 'Away', 8); // 전력차 큼 → 스코어라인 갈릴 가능성↑
    return {
      home: { club: home, tactic: defaultTactic(home) },
      away: { club: away, tactic: defaultTactic(away) },
      seed,
    };
  }

  it('동일 시드면 동일한 결과(재현성)', () => {
    const a = simulateMatchWithAiTactics(setup(11));
    const b = simulateMatchWithAiTactics(setup(11));
    expect(a).toEqual(b);
  });

  it('AI 개입이 실제로 작동해 plain simulateMatch와 다른 결과가 나오는 시드가 존재한다', () => {
    let anyDifferent = false;
    for (let seed = 1; seed <= 80; seed++) {
      const a = simulateMatch(setup(seed));
      const b = simulateMatchWithAiTactics(setup(seed));
      if (a.score[0] !== b.score[0] || a.score[1] !== b.score[1] || a.events.length !== b.events.length) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });
});

describe('F09 고도화(고도화 항목44): 하프타임 한정이 아니라 득실차 변화 시점마다 반응형 전술 재평가', () => {
  function setup(seed: number): MatchSetup {
    const rng = new Rng(seed);
    const home = generateClub(rng, 'h', 'Home', 14);
    const away = generateClub(rng, 'a', 'Away', 8); // 전력차 큼 → 전반 골 가능성↑
    return {
      home: { club: home, tactic: defaultTactic(home) },
      away: { club: away, tactic: defaultTactic(away) },
      seed,
    };
  }

  /** 항목44 이전의 "하프타임 한정" 개입 방식을 그대로 재현한 참조 구현. */
  function halftimeOnlySimulate(s: MatchSetup) {
    const live = new LiveMatch(s);
    live.runFirstHalf();
    const [hg, ag] = live.score();
    const halfInjuries = live.injuries().filter((e) => e.minute <= HALF_TIME);
    for (const side of ['home', 'away'] as const) {
      const { club, tactic } = s[side];
      const myGoals = side === 'home' ? hg : ag;
      const oppGoals = side === 'home' ? ag : hg;
      const sideInjuries = halfInjuries.filter((e) => e.side === side);
      const next = decideAiHalftimeTactic(club, tactic, myGoals, oppGoals, sideInjuries);
      if (next) live.setTactic(side, next);
    }
    live.runToEnd();
    return live.result();
  }

  it('전반에 스코어가 바뀌는 시드가 존재하고, 그런 시드에서는 하프타임까지 기다리는 옛 방식과 결과가 달라진다', () => {
    let sawFirstHalfGoal = false;
    let anyDifferentGivenFirstHalfGoal = false;
    for (let seed = 1; seed <= 100; seed++) {
      const s = setup(seed);
      const newResult = simulateMatchWithAiTactics(s);
      const hasFirstHalfGoal = newResult.events.some(
        (e) => e.minute <= HALF_TIME && (e.outcome === 'GOAL' || e.outcome === 'OWN_GOAL'),
      );
      if (!hasFirstHalfGoal) continue;
      sawFirstHalfGoal = true;
      const oldResult = halftimeOnlySimulate(s);
      if (
        newResult.score[0] !== oldResult.score[0] || newResult.score[1] !== oldResult.score[1]
        || newResult.events.length !== oldResult.events.length
      ) {
        anyDifferentGivenFirstHalfGoal = true;
        break;
      }
    }
    expect(sawFirstHalfGoal).toBe(true);
    expect(anyDifferentGivenFirstHalfGoal).toBe(true);
  });

  it('경기 전체에 골이 전혀 없는 시드는 하프타임까지 기다리는 옛 방식과 결과가 동일하다', () => {
    // 옛 방식은 하프타임 이후로는 전술을 다시 평가하지 않으므로, 후반 득점만으로도
    // (전반은 무득점이었더라도) 새 방식과 갈릴 수 있다 — "완전 무득점"만 동일성을 보장한다.
    let sawGoallessMatch = false;
    for (let seed = 1; seed <= 200; seed++) {
      const s = setup(seed);
      const newResult = simulateMatchWithAiTactics(s);
      const hasAnyGoal = newResult.events.some((e) => e.outcome === 'GOAL' || e.outcome === 'OWN_GOAL');
      if (hasAnyGoal) continue;
      sawGoallessMatch = true;
      const oldResult = halftimeOnlySimulate(s);
      expect(newResult.score).toEqual(oldResult.score);
      expect(newResult.events.length).toEqual(oldResult.events.length);
    }
    expect(sawGoallessMatch).toBe(true);
  });

  it('동일 시드면 여전히 재현 가능하다', () => {
    const a = simulateMatchWithAiTactics(setup(42));
    const b = simulateMatchWithAiTactics(setup(42));
    expect(a).toEqual(b);
  });
});

describe('F09 고도화(고도화 항목49): 컨디션 기반 로테이션 교체', () => {
  it('경기 전 컨디션이 임계값 미만인 선발이 있으면 벤치 최적 자원으로 교체한다', () => {
    const club = makeClub(7);
    const tactic = defaultTactic(club);
    const slot = tactic.lineup.find((s) => s.position !== 'GK')!;
    const tired = club.players.find((p) => p.id === slot.playerId)!;
    tired.condition = 0.4;
    const next = decideConditionRotation(club, tactic);
    expect(next).not.toBeNull();
    expect(next!.lineup.some((s) => s.playerId === tired.id)).toBe(false);
    expect(next!.lineup.length).toBe(tactic.lineup.length);
  });

  it('모든 선발의 컨디션이 임계값 이상이면 교체하지 않는다', () => {
    const club = makeClub(8);
    const tactic = defaultTactic(club);
    for (const p of club.players) p.condition = 1;
    expect(decideConditionRotation(club, tactic)).toBeNull();
  });

  it('GK는 컨디션이 낮아도 로테이션 대상에서 제외한다', () => {
    const club = makeClub(9);
    const tactic = defaultTactic(club);
    for (const p of club.players) p.condition = 1;
    const gkSlot = tactic.lineup.find((s) => s.position === 'GK')!;
    const gk = club.players.find((p) => p.id === gkSlot.playerId)!;
    gk.condition = 0.3;
    expect(decideConditionRotation(club, tactic)).toBeNull();
  });

  it('벤치 자원이 전혀 없으면(전원 출전 중) 교체하지 않는다', () => {
    const club = makeClub(10);
    const tactic = defaultTactic(club);
    const lineupIds = new Set(tactic.lineup.map((s) => s.playerId));
    for (const p of club.players) {
      if (!lineupIds.has(p.id)) p.injuryMatches = 3;
    }
    const slot = tactic.lineup.find((s) => s.position !== 'GK')!;
    const tired = club.players.find((p) => p.id === slot.playerId)!;
    tired.condition = 0.4;
    expect(decideConditionRotation(club, tactic)).toBeNull();
  });

  it('가장 지친 선발 1명만 교체한다(여러 명이 임계값 미만이어도)', () => {
    const club = makeClub(11);
    const tactic = defaultTactic(club);
    const outfieldSlots = tactic.lineup.filter((s) => s.position !== 'GK');
    const p1 = club.players.find((p) => p.id === outfieldSlots[0]!.playerId)!;
    const p2 = club.players.find((p) => p.id === outfieldSlots[1]!.playerId)!;
    p1.condition = 0.5;
    p2.condition = 0.3; // 더 지친 선수
    const next = decideConditionRotation(club, tactic);
    expect(next).not.toBeNull();
    expect(next!.lineup.some((s) => s.playerId === p2.id)).toBe(false);
    expect(next!.lineup.some((s) => s.playerId === p1.id)).toBe(true);
  });

  it('simulateMatchWithAiTactics에 실제로 반영된다(지친 선발이 로테이션돼 결과가 달라진다)', () => {
    const rng = new Rng(20);
    const home = generateClub(rng, 'h', 'Home', 14);
    const away = generateClub(new Rng(21), 'a', 'Away', 8);
    const homeTactic = defaultTactic(home);
    const awaySlot = homeTactic.lineup.find((s) => s.position !== 'GK')!;
    const tired = home.players.find((p) => p.id === awaySlot.playerId)!;
    tired.condition = 0.4;
    const setupTired: MatchSetup = {
      home: { club: home, tactic: homeTactic }, away: { club: away, tactic: defaultTactic(away) }, seed: 5,
    };
    const rotatedResult = simulateMatchWithAiTactics(setupTired);
    expect(rotatedResult.playerStats.home.some((s) => s.playerId === tired.id && s.shots + s.rating > 0)).toBe(true);

    tired.condition = 1; // 로테이션 대상이 아닌 상태로 재시뮬레이션
    const baselineResult = simulateMatchWithAiTactics(setupTired);
    expect(rotatedResult.events.length === baselineResult.events.length
      && rotatedResult.score[0] === baselineResult.score[0]
      && rotatedResult.score[1] === baselineResult.score[1]).toBe(false);
  });
});
