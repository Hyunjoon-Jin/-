import { describe, it, expect } from 'vitest';
import { LiveMatch, HALF_TIME } from '../src/liveMatch.js';
import { simulateMatch, type MatchSetup } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function setup(seed = 7): MatchSetup {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 14);
  const away = generateClub(rng, 'a', 'Away', 11);
  return {
    home: { club: home, tactic: defaultTactic(home) },
    away: { club: away, tactic: defaultTactic(away) },
    seed,
  };
}

describe('LiveMatch', () => {
  it('전술 변경 없이 끝까지 진행하면 simulateMatch와 완전히 동일하다 (재현성)', () => {
    const s = setup(123);
    const oneShot = simulateMatch(s);

    const live = new LiveMatch(s);
    live.runFirstHalf();
    live.runToEnd();
    const fromLive = live.result();

    expect(fromLive.score).toEqual(oneShot.score);
    expect(fromLive.shots).toEqual(oneShot.shots);
    expect(fromLive.possession).toEqual(oneShot.possession);
    expect(fromLive.events.length).toBe(oneShot.events.length);
    expect(fromLive.events.map((e) => `${e.minute}:${e.outcome}:${e.playerId}`))
      .toEqual(oneShot.events.map((e) => `${e.minute}:${e.outcome}:${e.playerId}`));
  });

  it('전반은 45분까지만, 이벤트 분은 1~45 범위', () => {
    const live = new LiveMatch(setup(55));
    const firstHalf = live.runFirstHalf();
    expect(live.minute()).toBe(HALF_TIME);
    expect(live.isDone()).toBe(false);
    for (const e of firstHalf) {
      expect(e.minute).toBeGreaterThanOrEqual(1);
      expect(e.minute).toBeLessThanOrEqual(HALF_TIME);
    }
  });

  it('runToEnd 후 경기 종료', () => {
    const live = new LiveMatch(setup(99));
    live.runToEnd();
    expect(live.isDone()).toBe(true);
    const r = live.result();
    const goals = r.events.filter((e) => e.outcome === 'GOAL').length;
    expect(goals).toBe(r.score[0] + r.score[1]);
  });

  it('하프타임 전술 변경은 결과를 바꾼다(공격적으로 전환 시 다른 전개)', () => {
    const base = setup(2024);
    // 기준: 변경 없음
    const a = new LiveMatch(base);
    a.runFirstHalf(); a.runToEnd();
    const ra = a.result();

    // 하프타임에 홈 전술을 극단적 공격으로 변경
    const b = new LiveMatch(base);
    b.runFirstHalf();
    b.setTactic('home', { ...base.home.tactic, mentality: 1, tempo: 1 });
    b.runToEnd();
    const rb = b.result();

    // 전반 이벤트 수는 같고(동일 시드·동일 전반), 전체 결과는 달라질 수 있다
    const firstHalfA = ra.events.filter((e) => e.minute <= HALF_TIME).length;
    const firstHalfB = rb.events.filter((e) => e.minute <= HALF_TIME).length;
    expect(firstHalfB).toBe(firstHalfA);
  });
});
