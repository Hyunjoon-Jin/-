import { describe, it, expect } from 'vitest';
import {
  matchWeather, WEATHER_LABEL, WEATHER_ATTACK_MULTIPLIER, WEATHER_CREATION_MULTIPLIER,
  WEATHER_FATIGUE_MULTIPLIER, WEATHER_INJURY_MULTIPLIER,
} from '../src/weather.js';
import { simulateMatch, type MatchSetup } from '../src/simulateMatch.js';
import { applyMatchEffects } from '../src/matchEffects.js';
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
    expect(WEATHER_LABEL.heat.length).toBeGreaterThan(0);
    expect(WEATHER_LABEL.cold.length).toBeGreaterThan(0);
  });

  it('폭염·혹한도 결정론적으로 나오고, 다수 시드에 걸쳐 실제로 등장한다(고도화 항목47)', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 500; seed++) {
      results.add(matchWeather(seed, 'home', 'away'));
    }
    expect(results.has('heat')).toBe(true);
    expect(results.has('cold')).toBe(true);
    expect(matchWeather(777, 'home', 'away')).toBe(matchWeather(777, 'home', 'away'));
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

describe('고도화 항목47: 폭염·혹한 배율', () => {
  it('폭염은 체력 소모 배율이 1보다 크고, 나머지 날씨는 1이다', () => {
    expect(WEATHER_FATIGUE_MULTIPLIER.heat).toBeGreaterThan(1);
    expect(WEATHER_FATIGUE_MULTIPLIER.clear).toBe(1);
    expect(WEATHER_FATIGUE_MULTIPLIER.rain).toBe(1);
    expect(WEATHER_FATIGUE_MULTIPLIER.windy).toBe(1);
    expect(WEATHER_FATIGUE_MULTIPLIER.cold).toBe(1);
  });

  it('혹한은 부상 위험 배율이 1보다 크고, 나머지 날씨는 1이다', () => {
    expect(WEATHER_INJURY_MULTIPLIER.cold).toBeGreaterThan(1);
    expect(WEATHER_INJURY_MULTIPLIER.clear).toBe(1);
    expect(WEATHER_INJURY_MULTIPLIER.rain).toBe(1);
    expect(WEATHER_INJURY_MULTIPLIER.windy).toBe(1);
    expect(WEATHER_INJURY_MULTIPLIER.heat).toBe(1);
  });

  it('폭염 경기를 뛴 선수는 맑은 날씨 경기를 뛴 선수보다 컨디션이 더 많이 떨어진다', () => {
    const rng = new Rng(1);
    const home = generateClub(rng, 'h', 'Home', 12);
    const tactic = defaultTactic(home);
    home.players.forEach((p) => { p.condition = 1; });
    const homeClear = structuredClone(home);
    const homeHeat = structuredClone(home);

    const base = simulateMatch({
      home: { club: home, tactic }, away: { club: generateClub(new Rng(2), 'a', 'Away', 12), tactic }, seed: 1,
    });

    applyMatchEffects(homeClear, tactic, generateClub(new Rng(2), 'a', 'Away', 12), tactic, { ...base, weather: 'clear' }, rng);
    applyMatchEffects(homeHeat, tactic, generateClub(new Rng(2), 'a', 'Away', 12), tactic, { ...base, weather: 'heat' }, rng);

    const starterIds = new Set(tactic.lineup.map((s) => s.playerId));
    const avgCondition = (club: typeof home) =>
      club.players.filter((p) => starterIds.has(p.id)).reduce((s, p) => s + p.condition, 0) / starterIds.size;
    expect(avgCondition(homeHeat)).toBeLessThan(avgCondition(homeClear));
  });

  it('혹한 경기는 맑은 날씨보다 다수 시드 누적 부상 발생 수가 더 많다', () => {
    const homeId = 'h';
    const awayId = 'a';
    const coldSeeds: number[] = [];
    const clearSeeds: number[] = [];
    for (let seed = 1; seed <= 3000 && (coldSeeds.length < 200 || clearSeeds.length < 200); seed++) {
      const w = matchWeather(seed, homeId, awayId);
      if (w === 'cold' && coldSeeds.length < 200) coldSeeds.push(seed);
      if (w === 'clear' && clearSeeds.length < 200) clearSeeds.push(seed);
    }
    const totalInjuries = (seeds: number[]): number =>
      seeds.reduce((sum, seed) => {
        const home = generateClub(new Rng(10), homeId, 'Home', 12);
        const away = generateClub(new Rng(20), awayId, 'Away', 12);
        const result = simulateMatch({
          home: { club: home, tactic: defaultTactic(home) },
          away: { club: away, tactic: defaultTactic(away) },
          seed,
        });
        return sum + result.injuries.length;
      }, 0);
    expect(totalInjuries(coldSeeds)).toBeGreaterThan(totalInjuries(clearSeeds));
  });
});
