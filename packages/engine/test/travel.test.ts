import { describe, it, expect } from 'vitest';
import { matchTravelBurden, TRAVEL_BURDEN_LABEL, TRAVEL_CONDITION_PENALTY } from '../src/travel.js';
import { simulateMatch, type MatchSetup } from '../src/simulateMatch.js';
import { applyMatchEffects } from '../src/matchEffects.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';

describe('고도화 항목48: 원정 이동 부담', () => {
  it('같은 시드+같은 대진이면 항상 같은 이동 부담이 나온다(결정론적)', () => {
    const a = matchTravelBurden(123, 'home', 'away');
    const b = matchTravelBurden(123, 'home', 'away');
    expect(a).toBe(b);
  });

  it('시드나 대진이 바뀌면 다른 이동 부담이 나올 수 있다(다양성 확인)', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      results.add(matchTravelBurden(seed, 'home', 'away'));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('모든 이동 부담 종류에 라벨이 있다', () => {
    expect(TRAVEL_BURDEN_LABEL.short.length).toBeGreaterThan(0);
    expect(TRAVEL_BURDEN_LABEL.medium.length).toBeGreaterThan(0);
    expect(TRAVEL_BURDEN_LABEL.long.length).toBeGreaterThan(0);
  });

  it('단거리는 컨디션 페널티가 0이고(하위 호환), 중·장거리는 0보다 크며 장거리가 더 크다', () => {
    expect(TRAVEL_CONDITION_PENALTY.short).toBe(0);
    expect(TRAVEL_CONDITION_PENALTY.medium).toBeGreaterThan(0);
    expect(TRAVEL_CONDITION_PENALTY.long).toBeGreaterThan(TRAVEL_CONDITION_PENALTY.medium);
  });

  it('simulateMatch 결과에 실제 경기에 적용된 원정 이동 부담이 실린다', () => {
    const home = generateClub(new Rng(1), 'h', 'Home', 12);
    const away = generateClub(new Rng(2), 'a', 'Away', 12);
    const setup: MatchSetup = {
      home: { club: home, tactic: defaultTactic(home) },
      away: { club: away, tactic: defaultTactic(away) },
      seed: 999,
    };
    const result = simulateMatch(setup);
    expect(result.awayTravelBurden).toBe(matchTravelBurden(999, 'h', 'a'));
  });

  it('장거리 원정 경기를 뛴 원정팀 선수는 단거리 원정을 뛴 선수보다 컨디션이 더 많이 떨어진다', () => {
    const rng = new Rng(1);
    const home = generateClub(rng, 'h', 'Home', 12);
    const homeTactic = defaultTactic(home);
    const away = generateClub(new Rng(2), 'a', 'Away', 12);
    const awayTactic = defaultTactic(away);
    away.players.forEach((p) => { p.condition = 1; });
    const awayShort = structuredClone(away);
    const awayLong = structuredClone(away);

    const base = simulateMatch({
      home: { club: home, tactic: homeTactic }, away: { club: away, tactic: awayTactic }, seed: 1,
    });

    applyMatchEffects(
      structuredClone(home), homeTactic, awayShort, awayTactic,
      { ...base, awayTravelBurden: 'short' }, rng,
    );
    applyMatchEffects(
      structuredClone(home), homeTactic, awayLong, awayTactic,
      { ...base, awayTravelBurden: 'long' }, rng,
    );

    const starterIds = new Set(awayTactic.lineup.map((s) => s.playerId));
    const avgCondition = (club: typeof away) =>
      club.players.filter((p) => starterIds.has(p.id)).reduce((s, p) => s + p.condition, 0) / starterIds.size;
    expect(avgCondition(awayLong)).toBeLessThan(avgCondition(awayShort));
  });

  it('홈팀 컨디션은 원정 이동 부담의 영향을 받지 않는다', () => {
    const rng = new Rng(1);
    const home = generateClub(rng, 'h', 'Home', 12);
    const homeTactic = defaultTactic(home);
    const away = generateClub(new Rng(2), 'a', 'Away', 12);
    const awayTactic = defaultTactic(away);
    home.players.forEach((p) => { p.condition = 1; });
    const homeShort = structuredClone(home);
    const homeLong = structuredClone(home);

    const base = simulateMatch({
      home: { club: home, tactic: homeTactic }, away: { club: away, tactic: awayTactic }, seed: 1,
    });

    applyMatchEffects(
      homeShort, homeTactic, structuredClone(away), awayTactic,
      { ...base, awayTravelBurden: 'short' }, rng,
    );
    applyMatchEffects(
      homeLong, homeTactic, structuredClone(away), awayTactic,
      { ...base, awayTravelBurden: 'long' }, rng,
    );

    const starterIds = new Set(homeTactic.lineup.map((s) => s.playerId));
    const avgCondition = (club: typeof home) =>
      club.players.filter((p) => starterIds.has(p.id)).reduce((s, p) => s + p.condition, 0) / starterIds.size;
    expect(avgCondition(homeLong)).toBe(avgCondition(homeShort));
  });
});
