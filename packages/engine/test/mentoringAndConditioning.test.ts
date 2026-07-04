import { describe, it, expect } from 'vitest';
import { progressPlayer } from '../src/progression.js';
import { createContext } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { currentAbility } from '../src/derived.js';
import { Rng } from '../src/rng.js';
import type { Player } from '../src/types.js';

/**
 * 멘토링 성장 보너스 + 부상방지 훈련 포커스(Phase 5 교차 스윕 B2/B6) 회귀 테스트.
 * 예전엔 리더 특성이 franchise.ts의 스쿼드 전체 사기에만 쓰였고(같은 라인
 * 유망주의 성장 속도는 전혀 건드리지 않았다), 훈련 포커스는 능력치 성장만
 * 강조할 뿐 부상 확률에는 아무 영향이 없었다.
 */
function makeYoungster(): Player {
  return {
    id: 'p1', name: 'Young', nationality: 'KOR', age: 19, position: 'ST',
    familiarity: { ST: 1.0 }, attributes: {
      finishing: 10, shooting: 10, passing: 10, crossing: 10, dribbling: 10,
      firstTouch: 10, technique: 10, tackling: 10, marking: 10, heading: 10, setPiece: 10,
      vision: 10, composure: 10, decisions: 10, anticipation: 10, offTheBall: 10,
      positioning: 10, concentration: 10, teamwork: 10, workRate: 10, aggression: 10,
      bravery: 10, leadership: 10,
      pace: 10, acceleration: 10, stamina: 10, strength: 10, agility: 10,
      balance: 10, jumping: 10, naturalFitness: 10,
      reflexes: 10, handling: 10, oneOnOne: 10, aerialReach: 10, goalkicks: 10,
    },
    potential: 190, condition: 1, morale: 0.5, seasonApps: 0, injuryMatches: 0,
    yellowCards: 0, suspensionMatches: 0, contractYears: 3, wage: 0,
    trainingFocus: 'balanced', traits: [], caps: 0, seasonGoals: 0, careerApps: 0,
    careerGoals: 0, caHistory: [],
  };
}

describe('progressPlayer: 멘토링 보너스', () => {
  it('mentorBonus를 넘기면 성장률이 그만큼 가속된다(동일 rng 시드 비교)', () => {
    const withoutMentor = makeYoungster();
    const withMentor = makeYoungster();

    progressPlayer(withoutMentor, new Rng(1), 10, 1);
    progressPlayer(withMentor, new Rng(1), 10, 1.15);

    expect(currentAbility(withMentor)).toBeGreaterThan(currentAbility(withoutMentor));
  });

  it('mentorBonus 기본값(생략)은 1을 넘긴 것과 동일하게 동작한다(하위 호환)', () => {
    const implicit = makeYoungster();
    const explicit = makeYoungster();
    progressPlayer(implicit, new Rng(5), 10);
    progressPlayer(explicit, new Rng(5), 10, 1);
    expect(currentAbility(implicit)).toBeCloseTo(currentAbility(explicit), 9);
  });
});

describe('부상방지 훈련 포커스', () => {
  it('훈련 포커스를 부상방지로 맞추면 부상 발생 빈도가 낮아진다(다수 시드 누적 비교)', () => {
    let conditioningInjuries = 0;
    let balancedInjuries = 0;
    const trials = 80;
    for (let s = 1; s <= trials; s++) {
      const seed = s + 60000;
      const rngCond = new Rng(seed);
      const homeCond = generateClub(rngCond, 'h', 'Home', 13);
      const awayCond = generateClub(rngCond, 'a', 'Away', 12);
      for (const p of homeCond.players) p.trainingFocus = 'conditioning';
      const ctxCond = createContext({
        home: { club: homeCond, tactic: defaultTactic(homeCond) },
        away: { club: awayCond, tactic: defaultTactic(awayCond) },
        seed,
      });
      conditioningInjuries += ctxCond.injuries.filter((e) => e.side === 'home').length;

      const rngBal = new Rng(seed);
      const homeBal = generateClub(rngBal, 'h', 'Home', 13);
      const awayBal = generateClub(rngBal, 'a', 'Away', 12);
      for (const p of homeBal.players) p.trainingFocus = 'balanced';
      const ctxBal = createContext({
        home: { club: homeBal, tactic: defaultTactic(homeBal) },
        away: { club: awayBal, tactic: defaultTactic(awayBal) },
        seed,
      });
      balancedInjuries += ctxBal.injuries.filter((e) => e.side === 'home').length;
    }
    expect(conditioningInjuries).toBeLessThan(balancedInjuries);
  });

  it('부상방지 포커스는 다른 능력치 성장 강조를 하지 않는다(균형과 동일한 빈 강조 목록)', async () => {
    const { TRAINING_FOCUS_ATTRS } = await import('../src/training.js');
    expect(TRAINING_FOCUS_ATTRS.conditioning).toEqual([]);
  });
});
