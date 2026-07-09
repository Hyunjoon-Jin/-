import { describe, it, expect } from 'vitest';
import { createContext, stepMinute } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function matchup(seed = 1) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

describe('후반 막판 총공세/역습 노출(고도화 항목50)', () => {
  it('80분 이후 뒤지는 팀은 동률일 때보다 평균 슈팅이 늘어난다(다수 시드 누적 비교)', () => {
    const { home, away, ht, at } = matchup(70);

    function runLateShots(seed: number, homeTrailing: boolean): number {
      const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      ctx.home.goals = homeTrailing ? 0 : 1;
      ctx.away.goals = 1;
      let shots = 0;
      for (let minute = 80; minute <= 89; minute++) {
        const before = ctx.home.shots;
        stepMinute(ctx, minute);
        shots += ctx.home.shots - before;
      }
      return shots;
    }

    const N = 200;
    let trailingTotal = 0;
    let levelTotal = 0;
    for (let seed = 1; seed <= N; seed++) {
      trailingTotal += runLateShots(seed, true);
      levelTotal += runLateShots(seed, false);
    }
    expect(trailingTotal / N).toBeGreaterThan(levelTotal / N);
  });

  it('79분까지는 스코어가 달라도 총공세 배율이 적용되지 않는다(같은 시드면 결과 완전히 동일)', () => {
    const { home, away, ht, at } = matchup(71);

    function runEarlyShots(seed: number, homeTrailing: boolean): number {
      const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      ctx.home.goals = homeTrailing ? 0 : 1;
      ctx.away.goals = 1;
      let shots = 0;
      for (let minute = 1; minute <= 79; minute++) {
        const before = ctx.home.shots;
        stepMinute(ctx, minute);
        shots += ctx.home.shots - before;
      }
      return shots;
    }

    for (let seed = 1; seed <= 5; seed++) {
      expect(runEarlyShots(seed, true)).toBe(runEarlyShots(seed, false));
    }
  });

  it('원정팀이 뒤질 때도 마찬가지로 후반 막판 슈팅이 늘어난다', () => {
    const { home, away, ht, at } = matchup(72);

    function runLateShots(seed: number, awayTrailing: boolean): number {
      const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      ctx.away.goals = awayTrailing ? 0 : 1;
      ctx.home.goals = 1;
      let shots = 0;
      for (let minute = 80; minute <= 89; minute++) {
        const before = ctx.away.shots;
        stepMinute(ctx, minute);
        shots += ctx.away.shots - before;
      }
      return shots;
    }

    const N = 200;
    let trailingTotal = 0;
    let levelTotal = 0;
    for (let seed = 1; seed <= N; seed++) {
      trailingTotal += runLateShots(seed, true);
      levelTotal += runLateShots(seed, false);
    }
    expect(trailingTotal / N).toBeGreaterThan(levelTotal / N);
  });

  it('뒤지는 팀은 수비도 비어 상대의 후반 막판 슈팅 기회도 함께 늘어난다', () => {
    const { home, away, ht, at } = matchup(73);

    function runOppLateShots(seed: number, homeTrailing: boolean): number {
      const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      ctx.home.goals = homeTrailing ? 0 : 1;
      ctx.away.goals = 1;
      let shots = 0;
      for (let minute = 80; minute <= 89; minute++) {
        const before = ctx.away.shots;
        stepMinute(ctx, minute);
        shots += ctx.away.shots - before;
      }
      return shots;
    }

    const N = 200;
    let homeTrailingTotal = 0;
    let levelTotal = 0;
    for (let seed = 1; seed <= N; seed++) {
      homeTrailingTotal += runOppLateShots(seed, true);
      levelTotal += runOppLateShots(seed, false);
    }
    expect(homeTrailingTotal / N).toBeGreaterThan(levelTotal / N);
  });
});
