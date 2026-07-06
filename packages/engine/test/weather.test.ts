import { describe, it, expect } from 'vitest';
import { matchWeather, WEATHER_LABEL, WEATHER_ATTACK_MULTIPLIER, WEATHER_CREATION_MULTIPLIER } from '../src/weather.js';
import { simulateMatch, type MatchSetup } from '../src/simulateMatch.js';
import { generateClub } from '../src/generate.js';
import { defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';

describe('신규 개선 항목 26: 경기 날씨', () => {
  it('같은 시드+같은 대진이면 항상 같은 날씨가 나온다(결정론적)', () => {
    const w1 = matchWeather(123, 'home', 'away');
    const w2 = matchWeather(123, 'home', 'away');
    expect(w1).toBe(w2);
  });

  it('시드나 대진이 바뀌면 다른 날씨가 나올 수 있다(다양성 확인)', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      results.add(matchWeather(seed, 'home', 'away'));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('모든 날씨 종류에 라벨이 있다', () => {
    expect(WEATHER_LABEL.clear.length).toBeGreaterThan(0);
    expect(WEATHER_LABEL.rain.length).toBeGreaterThan(0);
    expect(WEATHER_LABEL.windy.length).toBeGreaterThan(0);
  });

  it('맑음은 배율이 1이고(하위 호환), 비·강풍은 1보다 작다', () => {
    expect(WEATHER_ATTACK_MULTIPLIER.clear).toBe(1);
    expect(WEATHER_CREATION_MULTIPLIER.clear).toBe(1);
    expect(WEATHER_ATTACK_MULTIPLIER.rain).toBeLessThan(1);
    expect(WEATHER_CREATION_MULTIPLIER.rain).toBeLessThan(1);
    expect(WEATHER_ATTACK_MULTIPLIER.windy).toBeLessThan(1);
    expect(WEATHER_CREATION_MULTIPLIER.windy).toBeLessThan(1);
  });

  it('simulateMatch 결과에 실제 경기에 적용된 날씨가 실린다', () => {
    const home = generateClub(new Rng(1), 'h', 'Home', 12);
    const away = generateClub(new Rng(2), 'a', 'Away', 12);
    const setup: MatchSetup = {
      home: { club: home, tactic: defaultTactic(home) },
      away: { club: away, tactic: defaultTactic(away) },
      seed: 999,
    };
    const result = simulateMatch(setup);
    expect(result.weather).toBe(matchWeather(999, 'h', 'a'));
  });

  it('비 오는 경기는 맑은 경기보다 평균 슈팅 수가 적다(다수 시드 누적 비교, 창조력 저하 반영)', () => {
    const homeId = 'h';
    const awayId = 'a';
    const rainSeeds: number[] = [];
    const clearSeeds: number[] = [];
    for (let seed = 1; seed <= 2000 && (rainSeeds.length < 60 || clearSeeds.length < 60); seed++) {
      const w = matchWeather(seed, homeId, awayId);
      if (w === 'rain' && rainSeeds.length < 60) rainSeeds.push(seed);
      if (w === 'clear' && clearSeeds.length < 60) clearSeeds.push(seed);
    }
    const totalShots = (seeds: number[]): number =>
      seeds.reduce((sum, seed) => {
        const home = generateClub(new Rng(10), homeId, 'Home', 12);
        const away = generateClub(new Rng(20), awayId, 'Away', 12);
        const result = simulateMatch({
          home: { club: home, tactic: defaultTactic(home) },
          away: { club: away, tactic: defaultTactic(away) },
          seed,
        });
        return sum + result.shots[0] + result.shots[1];
      }, 0);
    const rainAvg = totalShots(rainSeeds) / rainSeeds.length;
    const clearAvg = totalShots(clearSeeds) / clearSeeds.length;
    expect(rainAvg).toBeLessThan(clearAvg);
  });

  it('같은 시드로 두 번 시뮬레이션하면 날씨도 결과도 완전히 동일하다(재현성)', () => {
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
    expect(r1.weather).toBe(r2.weather);
    expect(r1.score).toEqual(r2.score);
  });
});
