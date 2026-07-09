import { describe, it, expect } from 'vitest';
import {
  matchRefereeStrictness, REFEREE_STRICTNESS_LABEL, REFEREE_CARD_MULTIPLIER, AWAY_CARD_BIAS_MULTIPLIER,
} from '../src/referee.js';
import { simulateMatch, type MatchSetup } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';

describe('고도화 항목46: 심판 엄격도', () => {
  it('같은 시드+같은 대진이면 항상 같은 엄격도가 나온다(결정론적)', () => {
    const a = matchRefereeStrictness(123, 'home', 'away');
    const b = matchRefereeStrictness(123, 'home', 'away');
    expect(a).toBe(b);
  });

  it('시드나 대진이 바뀌면 다른 엄격도가 나올 수 있다(다양성 확인)', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      results.add(matchRefereeStrictness(seed, 'home', 'away'));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('모든 엄격도 종류에 라벨이 있다', () => {
    expect(REFEREE_STRICTNESS_LABEL.lenient.length).toBeGreaterThan(0);
    expect(REFEREE_STRICTNESS_LABEL.normal.length).toBeGreaterThan(0);
    expect(REFEREE_STRICTNESS_LABEL.strict.length).toBeGreaterThan(0);
  });

  it('보통은 배율이 1이고(하위 호환), 관대함은 1보다 작고 엄격함은 1보다 크다', () => {
    expect(REFEREE_CARD_MULTIPLIER.normal).toBe(1);
    expect(REFEREE_CARD_MULTIPLIER.lenient).toBeLessThan(1);
    expect(REFEREE_CARD_MULTIPLIER.strict).toBeGreaterThan(1);
  });

  it('simulateMatch 결과에 실제 경기에 적용된 심판 엄격도가 실린다', () => {
    const home = generateClub(new Rng(1), 'h', 'Home', 12);
    const away = generateClub(new Rng(2), 'a', 'Away', 12);
    const setup: MatchSetup = {
      home: { club: home, tactic: defaultTactic(home) },
      away: { club: away, tactic: defaultTactic(away) },
      seed: 999,
    };
    const result = simulateMatch(setup);
    expect(result.refereeStrictness).toBe(matchRefereeStrictness(999, 'h', 'a'));
  });

  it('엄격한 심판의 경기는 관대한 심판의 경기보다 평균 카드 수가 많다(다수 시드 누적 비교)', () => {
    const homeId = 'h';
    const awayId = 'a';
    const strictSeeds: number[] = [];
    const lenientSeeds: number[] = [];
    for (let seed = 1; seed <= 3000 && (strictSeeds.length < 60 || lenientSeeds.length < 60); seed++) {
      const r = matchRefereeStrictness(seed, homeId, awayId);
      if (r === 'strict' && strictSeeds.length < 60) strictSeeds.push(seed);
      if (r === 'lenient' && lenientSeeds.length < 60) lenientSeeds.push(seed);
    }
    const totalCards = (seeds: number[]): number =>
      seeds.reduce((sum, seed) => {
        const home = generateClub(new Rng(10), homeId, 'Home', 12);
        const away = generateClub(new Rng(20), awayId, 'Away', 12);
        const result = simulateMatch({
          home: { club: home, tactic: defaultTactic(home) },
          away: { club: away, tactic: defaultTactic(away) },
          seed,
        });
        return sum + result.cards.length;
      }, 0);
    const strictAvg = totalCards(strictSeeds) / strictSeeds.length;
    const lenientAvg = totalCards(lenientSeeds) / lenientSeeds.length;
    expect(strictAvg).toBeGreaterThan(lenientAvg);
  });

  it('레드카드 발생·인원수 열세 로직(고도화 항목41)과 함께 재현성이 유지된다', () => {
    const home = generateClub(new Rng(3), 'h', 'Home', 12);
    const away = generateClub(new Rng(4), 'a', 'Away', 12);
    const setup: MatchSetup = {
      home: { club: home, tactic: defaultTactic(home) },
      away: { club: away, tactic: defaultTactic(away) },
      seed: 42,
    };
    const r1 = simulateMatch(setup);
    const home2 = generateClub(new Rng(3), 'h', 'Home', 12);
    const away2 = generateClub(new Rng(4), 'a', 'Away', 12);
    const r2 = simulateMatch({
      home: { club: home2, tactic: defaultTactic(home2) },
      away: { club: away2, tactic: defaultTactic(away2) },
      seed: 42,
    });
    expect(r1.refereeStrictness).toBe(r2.refereeStrictness);
    expect(r1.cards).toEqual(r2.cards);
    expect(r1.score).toEqual(r2.score);
  });
});

describe('고도화 항목51: 심판의 홈 편향', () => {
  it('원정팀 카드 확률 편향 배율은 1보다 크다', () => {
    expect(AWAY_CARD_BIAS_MULTIPLIER).toBeGreaterThan(1);
  });

  it('동일한 조건의 두 팀이어도 원정팀이 평균적으로 카드를 더 많이 받는다(다수 시드 누적 비교)', () => {
    const totalBySide = (side: 'home' | 'away'): number => {
      let total = 0;
      const N = 300;
      for (let seed = 1; seed <= N; seed++) {
        const home = generateClub(new Rng(10), 'h', 'Home', 12);
        const away = generateClub(new Rng(10), 'a', 'Away', 12);
        const result = simulateMatch({
          home: { club: home, tactic: defaultTactic(home) },
          away: { club: away, tactic: defaultTactic(away) },
          seed,
        });
        total += result.cards.filter((c) => c.side === side).length;
      }
      return total;
    };
    expect(totalBySide('away')).toBeGreaterThan(totalBySide('home'));
  });
});
