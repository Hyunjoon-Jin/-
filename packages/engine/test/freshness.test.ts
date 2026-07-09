import { describe, it, expect } from 'vitest';
import { createContext, stepMinute, applyTactic, isFreshFromSub } from '../src/simulateMatch.js';
import { LiveMatch } from '../src/liveMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function matchup(seed = 1) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

describe('교체 투입 선수 프레시니스 보너스(고도화 항목57)', () => {
  it('applyTactic으로 라인업(선수 구성)이 실제로 바뀌면 그 분을 freshSubMinute으로 기록한다', () => {
    const { home, away, ht, at } = matchup(120);
    const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed: 1 });
    const bench = home.players.find((p) => !ht.lineup.some((s) => s.playerId === p.id))!;
    const outSlot = ht.lineup.find((s) => s.position !== 'GK')!;
    const subbed = { ...ht, lineup: ht.lineup.map((s) => (s === outSlot ? { ...s, playerId: bench.id } : s)) };
    applyTactic(ctx, 'home', subbed, 45);
    expect(ctx.freshSubMinute.home).toBe(45);
  });

  it('라인업 변경 없이 지시(멘탈리티 등)만 바뀐 경우엔 freshSubMinute이 기록되지 않는다', () => {
    const { home, away, ht, at } = matchup(121);
    const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed: 1 });
    applyTactic(ctx, 'home', { ...ht, mentality: 0.9 }, 60);
    expect(ctx.freshSubMinute.home).toBeUndefined();
  });

  it('isFreshFromSub: 교체 후 10분 이내는 true, 그 이후는 false를 반환한다', () => {
    const { home, away, ht, at } = matchup(122);
    const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed: 1 });
    ctx.freshSubMinute.home = 45;
    expect(isFreshFromSub(ctx, 'home', 46)).toBe(true);
    expect(isFreshFromSub(ctx, 'home', 55)).toBe(true);
    expect(isFreshFromSub(ctx, 'home', 56)).toBe(false);
    expect(isFreshFromSub(ctx, 'home', 45)).toBe(false); // 교체 당해 분은 아직 적용 전
    expect(isFreshFromSub(ctx, 'away', 46)).toBe(false); // 다른 팀은 영향 없음
  });

  it('교체 투입 직후 10분 동안 그 팀의 평균 슈팅이 늘어난다(다수 시드 누적 비교, LiveMatch 경유)', () => {
    const { home, away, ht, at } = matchup(123);
    const bench = home.players.find((p) => !ht.lineup.some((s) => s.playerId === p.id))!;
    const outSlot = ht.lineup.find((s) => s.position !== 'GK')!;
    const subbedTactic = { ...ht, lineup: ht.lineup.map((s) => (s === outSlot ? { ...s, playerId: bench.id } : s)) };

    function shotsInWindow(seed: number, doSub: boolean): number {
      const live = new LiveMatch({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      live.runUntil(40);
      if (doSub) live.setTactic('home', subbedTactic);
      const before = live.stats().shots[0];
      live.runUntil(50);
      return live.stats().shots[0] - before;
    }

    const N = 300;
    let withSub = 0;
    let without = 0;
    for (let seed = 1; seed <= N; seed++) {
      withSub += shotsInWindow(seed, true);
      without += shotsInWindow(seed, false);
    }
    expect(withSub).toBeGreaterThan(without);
  });

  it('일괄 시뮬(createContext, 전술 변경 없음)에서는 freshSubMinute이 항상 undefined다', () => {
    const { home, away, ht, at } = matchup(124);
    const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed: 1 });
    for (let minute = 1; minute <= 90; minute++) stepMinute(ctx, minute);
    expect(ctx.freshSubMinute.home).toBeUndefined();
    expect(ctx.freshSubMinute.away).toBeUndefined();
  });
});
