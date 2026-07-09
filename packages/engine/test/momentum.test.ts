import { describe, it, expect } from 'vitest';
import { createContext, stepMinute, MATCH_LENGTH, recentlyConceded } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function matchup(seed = 1) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

describe('골 직후 단기 모멘텀(동요) 효과(고도화 항목55)', () => {
  it('방금 실점한 팀은 그 직후 5분 동안 상대의 평균 슈팅 성공(득점) 기회가 더 늘어난다(다수 시드 누적 비교)', () => {
    const { home, away, ht, at } = matchup(110);

    // 40분에 강제로 홈이 실점한 것으로 이벤트 이력을 주입한 뒤, 41~45분(동요 구간) 동안
    // 원정팀(away, 홈 입장에서 상대)의 득점 수를 동요 상태(실점 직후) vs 평시(이벤트 없음)로 비교.
    function awayGoalsInWindow(seed: number, injectConcede: boolean): number {
      const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      for (let minute = 1; minute <= 40; minute++) stepMinute(ctx, minute);
      if (injectConcede) {
        ctx.events.push({
          minute: 40, side: 'away', chanceType: 'open', outcome: 'GOAL',
          playerId: 'x', playerName: 'x',
        });
      }
      const before = ctx.away.goals;
      for (let minute = 41; minute <= 45; minute++) stepMinute(ctx, minute);
      return ctx.away.goals - before;
    }

    const N = 500;
    let withConcede = 0;
    let without = 0;
    for (let seed = 1; seed <= N; seed++) {
      withConcede += awayGoalsInWindow(seed, true);
      without += awayGoalsInWindow(seed, false);
    }
    expect(withConcede).toBeGreaterThan(without);
  });

  it('recentlyConceded: 실점 직후 5분 이내는 true, 그 이후는 false를 반환한다', () => {
    const { home, away, ht, at } = matchup(111);
    const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed: 1 });
    ctx.events.push({ minute: 40, side: 'home', chanceType: 'open', outcome: 'GOAL', playerId: 'x', playerName: 'x' });
    // home이 40분에 득점 → away가 실점한 쪽
    expect(recentlyConceded(ctx, 'away', 41)).toBe(true);
    expect(recentlyConceded(ctx, 'away', 45)).toBe(true);
    expect(recentlyConceded(ctx, 'away', 46)).toBe(false);
    // 득점한 쪽(home)은 실점한 게 아니므로 항상 false
    expect(recentlyConceded(ctx, 'home', 41)).toBe(false);
  });

  it('자책골도 실점으로 집계된다', () => {
    const { home, away, ht, at } = matchup(113);
    const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed: 1 });
    // away 진영에서 자책골이 나오면 event.side는 'home'(득점 귀속 팀)으로 기록된다.
    ctx.events.push({
      minute: 30, side: 'home', chanceType: 'open', outcome: 'OWN_GOAL', playerId: 'x', playerName: 'x',
      isOwnGoal: true,
    });
    expect(recentlyConceded(ctx, 'away', 32)).toBe(true);
  });

  it('동일 시드면 재현성이 유지된다', () => {
    const { home, away, ht, at } = matchup(112);
    function run(seed: number) {
      const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      for (let minute = 1; minute <= MATCH_LENGTH; minute++) stepMinute(ctx, minute);
      return { score: [ctx.home.goals, ctx.away.goals], events: ctx.events };
    }
    const a = run(77);
    const b = run(77);
    expect(a).toEqual(b);
  });
});
