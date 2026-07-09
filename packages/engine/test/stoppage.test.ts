import { describe, it, expect } from 'vitest';
import { computeStoppage } from '../src/stoppage.js';
import { simulateMatch } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { MatchSetup, CardEvent, InjuryEvent, MatchEvent } from '../src/types.js';

function setup(seed = 1): MatchSetup {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return {
    home: { club: home, tactic: defaultTactic(home) },
    away: { club: away, tactic: defaultTactic(away) },
    seed,
  };
}

describe('가변 추가시간(스토파지 타임) 표시(고도화 항목58)', () => {
  it('카드·부상·이벤트가 전혀 없으면 기본값(전반 1분, 후반 2분)을 반환한다', () => {
    expect(computeStoppage([], [], [])).toEqual({ first: 1, second: 2 });
  });

  it('전반 카드·부상이 많을수록 전반 추가시간이 늘어난다', () => {
    const cards: CardEvent[] = [
      { minute: 10, side: 'home', playerId: 'a', playerName: 'A', type: 'yellow' },
      { minute: 20, side: 'away', playerId: 'b', playerName: 'B', type: 'yellow' },
    ];
    const injuries: InjuryEvent[] = [
      {
        minute: 15, side: 'home', playerId: 'c', playerName: 'C', matches: 1, severity: 'minor',
        name: '타박상', bodyPart: 'general',
      },
    ];
    const base = computeStoppage([], [], []);
    const withEvents = computeStoppage(cards, injuries, []);
    expect(withEvents.first).toBeGreaterThan(base.first);
  });

  it('후반 득점(세리머니)이 많을수록 후반 추가시간이 늘어난다', () => {
    const events: MatchEvent[] = [
      { minute: 60, side: 'home', chanceType: 'open', outcome: 'GOAL', playerId: 'a', playerName: 'A' },
      { minute: 75, side: 'away', chanceType: 'open', outcome: 'GOAL', playerId: 'b', playerName: 'B' },
      { minute: 88, side: 'home', chanceType: 'open', outcome: 'GOAL', playerId: 'a', playerName: 'A' },
    ];
    const base = computeStoppage([], [], []);
    const withGoals = computeStoppage([], [], events);
    expect(withGoals.second).toBeGreaterThan(base.second);
  });

  it('전반 이벤트는 후반 추가시간에, 후반 이벤트는 전반 추가시간에 영향을 주지 않는다', () => {
    const firstHalfCards: CardEvent[] = [
      { minute: 10, side: 'home', playerId: 'a', playerName: 'A', type: 'yellow' },
    ];
    const secondHalfCards: CardEvent[] = [
      { minute: 70, side: 'home', playerId: 'a', playerName: 'A', type: 'yellow' },
    ];
    expect(computeStoppage(firstHalfCards, [], []).second).toBe(computeStoppage([], [], []).second);
    expect(computeStoppage(secondHalfCards, [], []).first).toBe(computeStoppage([], [], []).first);
  });

  it('결과값은 항상 합리적인 범위(전반 0~5분, 후반 1~8분) 안에 있다', () => {
    const manyCards: CardEvent[] = Array.from({ length: 20 }, (_, i) => ({
      minute: (i % 44) + 1, side: (i % 2 === 0 ? 'home' : 'away') as 'home' | 'away',
      playerId: `p${i}`, playerName: `P${i}`, type: 'yellow' as const,
    }));
    const s = computeStoppage(manyCards, [], []);
    expect(s.first).toBeGreaterThanOrEqual(0);
    expect(s.first).toBeLessThanOrEqual(5);
    expect(s.second).toBeGreaterThanOrEqual(1);
    expect(s.second).toBeLessThanOrEqual(8);
  });

  it('simulateMatch 결과에 stoppage가 실려 있고, 카드·부상·이벤트로부터 결정론적으로 파생된다', () => {
    const result = simulateMatch(setup(999));
    expect(result.stoppage).toBeDefined();
    expect(result.stoppage).toEqual(computeStoppage(result.cards, result.injuries, result.events));
  });

  it('동일 시드면 추가시간도 완전히 동일하다(재현성)', () => {
    const a = simulateMatch(setup(42));
    const b = simulateMatch(setup(42));
    expect(a.stoppage).toEqual(b.stoppage);
  });

  it('추가시간은 표시 전용 메타데이터라 시뮬레이션 이벤트·스코어에는 영향이 없다(도입 전과 이벤트 개수 동일 검증은 별도 전체 스위트에서)', () => {
    const result = simulateMatch(setup(7));
    // stoppage 필드가 추가돼도 이벤트는 여전히 1~90분 범위 안에서만 발생한다(틱 수 불변 확인).
    for (const e of result.events) {
      expect(e.minute).toBeGreaterThanOrEqual(1);
      expect(e.minute).toBeLessThanOrEqual(90);
    }
  });
});
