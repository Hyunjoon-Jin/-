import { describe, it, expect } from 'vitest';
import { dynamicHomeAdvantage, simulateMatch } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { STADIUM_MAX } from '../src/finance.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function matchup(seed = 1) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

describe('dynamicHomeAdvantage (고도화 항목43)', () => {
  it('스타디움 등급 0·팬 만족도 60(둘 다 기본값)이면 기존 고정 배율(1.06)과 동일하다', () => {
    const { home } = matchup(1);
    home.finance.stadiumLevel = 0;
    home.finance.fanSatisfaction = 60;
    expect(dynamicHomeAdvantage(home)).toBeCloseTo(1.06, 10);
  });

  it('필드가 없는(구버전 세이브) 구단도 기존 고정 배율과 동일하다', () => {
    const { home } = matchup(2);
    delete home.finance.stadiumLevel;
    delete home.finance.fanSatisfaction;
    expect(dynamicHomeAdvantage(home)).toBeCloseTo(1.06, 10);
  });

  it('스타디움 등급이 높을수록 배율이 커진다', () => {
    const { home } = matchup(3);
    home.finance.fanSatisfaction = 60;
    home.finance.stadiumLevel = 0;
    const low = dynamicHomeAdvantage(home);
    home.finance.stadiumLevel = STADIUM_MAX;
    const high = dynamicHomeAdvantage(home);
    expect(high).toBeGreaterThan(low);
  });

  it('팬 만족도가 높을수록 배율이 커지고, 낮을수록 작아진다', () => {
    const { home } = matchup(4);
    home.finance.stadiumLevel = 0;
    home.finance.fanSatisfaction = 100;
    const happy = dynamicHomeAdvantage(home);
    home.finance.fanSatisfaction = 0;
    const unhappy = dynamicHomeAdvantage(home);
    expect(happy).toBeGreaterThan(unhappy);
  });

  it('1.0~1.12 범위로 클램프된다', () => {
    const { home } = matchup(5);
    home.finance.stadiumLevel = STADIUM_MAX;
    home.finance.fanSatisfaction = 100;
    expect(dynamicHomeAdvantage(home)).toBeLessThanOrEqual(1.12);
    home.finance.stadiumLevel = 0;
    home.finance.fanSatisfaction = 0;
    expect(dynamicHomeAdvantage(home)).toBeGreaterThanOrEqual(1.0);
  });
});

describe('simulateMatch: 홈 어드밴티지 반영 확인(고도화 항목43, 다수 시드 누적 비교)', () => {
  it('스타디움·팬 만족도가 모두 최고인 홈팀은 기본값 홈팀보다 평균적으로 더 많은 슈팅을 기록한다', () => {
    const { home, away, ht, at } = matchup(77);
    home.finance.stadiumLevel = STADIUM_MAX;
    home.finance.fanSatisfaction = 100;

    const baseline = generateClub(new Rng(77), 'h', 'Home', 13);
    const baselineTactic = defaultTactic(baseline);

    const N = 150;
    let boostedShots = 0;
    let baselineShots = 0;
    for (let seed = 1; seed <= N; seed++) {
      const r1 = simulateMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      boostedShots += r1.shots[0];
      const r2 = simulateMatch({
        home: { club: baseline, tactic: baselineTactic }, away: { club: away, tactic: at }, seed,
      });
      baselineShots += r2.shots[0];
    }
    expect(boostedShots / N).toBeGreaterThan(baselineShots / N);
  });
});
