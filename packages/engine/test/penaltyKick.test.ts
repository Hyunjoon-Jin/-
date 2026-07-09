import { describe, it, expect } from 'vitest';
import { createContext, stepMinute, MATCH_LENGTH } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function matchup(seed = 1) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

function runPenalties(home: ReturnType<typeof matchup>['home'], away: ReturnType<typeof matchup>['away'],
  ht: ReturnType<typeof matchup>['ht'], at: ReturnType<typeof matchup>['at'], seed: number) {
  const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
  for (let minute = 1; minute <= MATCH_LENGTH; minute++) stepMinute(ctx, minute);
  return ctx.events.filter((e) => e.chanceType === 'penalty');
}

describe('페널티킥 별도 이벤트(고도화 항목54)', () => {
  it('경기당 페널티 발생 빈도가 실제 통계와 비슷한 범위(양팀 합산 0.05~0.5개/경기)다', () => {
    const { home, away, ht, at } = matchup(100);
    const N = 500;
    let total = 0;
    for (let seed = 1; seed <= N; seed++) total += runPenalties(home, away, ht, at, seed).length;
    const perMatch = total / N;
    expect(perMatch).toBeGreaterThan(0.05);
    expect(perMatch).toBeLessThan(0.5);
  });

  it('페널티 전환율이 실제 통계와 비슷한 범위(60~90%)다', () => {
    const { home, away, ht, at } = matchup(101);
    const all: ReturnType<typeof runPenalties> = [];
    for (let seed = 1; seed <= 800 && all.length < 150; seed++) all.push(...runPenalties(home, away, ht, at, seed));
    expect(all.length).toBeGreaterThan(30); // 표본 확보 확인
    const goals = all.filter((e) => e.outcome === 'GOAL').length;
    const rate = goals / all.length;
    expect(rate).toBeGreaterThan(0.6);
    expect(rate).toBeLessThan(0.9);
  });

  it('페널티는 자책골로 이어지지 않는다', () => {
    const { home, away, ht, at } = matchup(102);
    for (let seed = 1; seed <= 500; seed++) {
      const pks = runPenalties(home, away, ht, at, seed);
      expect(pks.every((e) => e.outcome !== 'OWN_GOAL')).toBe(true);
    }
  });

  it('페널티 득점에는 어시스트가 붙지 않는다', () => {
    const { home, away, ht, at } = matchup(103);
    for (let seed = 1; seed <= 500; seed++) {
      const pks = runPenalties(home, away, ht, at, seed);
      expect(pks.every((e) => e.assistPlayerId === undefined)).toBe(true);
    }
  });

  it('세트피스 전담자가 지정된 팀은 페널티도 대부분 그 선수가 직접 찬다(다수 시드 누적 비교)', () => {
    const { home, away, ht, at } = matchup(104);
    const takerId = ht.setPieceTakerId!;
    expect(takerId).toBeDefined();
    let takerCount = 0;
    let total = 0;
    for (let seed = 1; seed <= 2000 && total < 100; seed++) {
      const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      for (let minute = 1; minute <= MATCH_LENGTH; minute++) stepMinute(ctx, minute);
      const pks = ctx.events.filter((e) => e.chanceType === 'penalty' && e.side === 'home');
      total += pks.length;
      takerCount += pks.filter((e) => e.playerId === takerId).length;
    }
    expect(total).toBeGreaterThan(20);
    expect(takerCount / total).toBeGreaterThan(0.7);
  });

  it('동일 시드면 페널티 이벤트를 포함해 완전히 동일한 결과가 나온다(재현성)', () => {
    const { home, away, ht, at } = matchup(105);
    const a = runPenalties(home, away, ht, at, 42);
    const b = runPenalties(home, away, ht, at, 42);
    expect(a).toEqual(b);
  });
});
