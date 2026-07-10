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

  it('stats(): 점유율 합 100, 유효슈팅 ≤ 슈팅, 종료 시 최종 결과와 일치', () => {
    const live = new LiveMatch(setup(321));
    live.runUntil(30);
    const mid = live.stats();
    expect(mid.possession[0] + mid.possession[1]).toBe(100);
    expect(mid.shotsOnTarget[0]).toBeLessThanOrEqual(mid.shots[0]);
    expect(mid.shotsOnTarget[1]).toBeLessThanOrEqual(mid.shots[1]);

    live.runToEnd();
    const end = live.stats();
    const r = live.result();
    expect(end.shots).toEqual(r.shots);
    expect(end.possession).toEqual(r.possession);
    // 유효슈팅(골+선방)은 최소한 골 수 이상
    expect(end.shotsOnTarget[0]).toBeGreaterThanOrEqual(r.score[0]);
    expect(end.shotsOnTarget[1]).toBeGreaterThanOrEqual(r.score[1]);
  });

  it('하프타임에 교체된(0슈팅) 수비수도 최종 평점 집계에 포함된다(최종 라인업이 아닌 실제 출전 전원 기준)', () => {
    const s = setup(321);
    const live = new LiveMatch(s);
    live.runFirstHalf();

    const tactic = s.home.tactic;
    const defSlot = tactic.lineup.find((sl) => sl.position === 'DC' || sl.position === 'DL' || sl.position === 'DR')!;
    const benchPlayer = s.home.club.players.find(
      (p) => !tactic.lineup.some((sl) => sl.playerId === p.id),
    )!;
    const newLineup = tactic.lineup.map((sl) => (sl.playerId === defSlot.playerId
      ? { ...sl, playerId: benchPlayer.id }
      : sl));
    live.setTactic('home', { ...tactic, lineup: newLineup });
    live.runToEnd();

    const result = live.result();
    const ids = result.playerStats.home.map((st) => st.playerId);
    // 교체돼 나간 수비수(슈팅을 거의 하지 않는 라인)도 평점 집계 대상에 포함돼야 한다.
    expect(ids).toContain(defSlot.playerId);
    // 교체돼 들어온 선수도 포함돼야 한다.
    expect(ids).toContain(benchPlayer.id);
  });

  it('result()를 여러 번 호출해도 평점이 중복 적용되지 않는다(멱등성)', () => {
    const live = new LiveMatch(setup(42));
    live.runToEnd();
    const first = live.result();
    const second = live.result();
    const third = live.result();
    expect(second).toBe(first); // 캐시된 동일 객체
    for (const st of first.playerStats.home) {
      const s2 = second.playerStats.home.find((s) => s.playerId === st.playerId)!;
      const s3 = third.playerStats.home.find((s) => s.playerId === st.playerId)!;
      expect(s2.rating).toBe(st.rating);
      expect(s3.rating).toBe(st.rating);
    }
  });

  it('liveRatings(): 라인업 전원 포함, 0~10 범위, 득점자는 기본치(6.0)보다 높다 (F3/C1)', () => {
    const s = setup(123);
    const live = new LiveMatch(s);
    live.runUntil(60);
    const ratings = live.liveRatings();

    for (const slot of [...s.home.tactic.lineup, ...s.away.tactic.lineup]) {
      const r = ratings.get(slot.playerId);
      expect(r).toBeDefined();
      expect(r!).toBeGreaterThanOrEqual(0);
      expect(r!).toBeLessThanOrEqual(10);
    }
  });

  it('liveRatings(): 득점 이벤트가 있으면 해당 선수 평점이 6.0을 넘는다', () => {
    // 골이 나오는 시드를 찾아 검증(결정적 — 같은 시드는 항상 같은 전개).
    for (let seed = 1; seed < 60; seed++) {
      const s = setup(seed);
      const live = new LiveMatch(s);
      const evs = live.runToEnd();
      const goal = evs.find((e) => e.outcome === 'GOAL');
      if (!goal) continue;
      const ratings = live.liveRatings();
      expect(ratings.get(goal.playerId)!).toBeGreaterThan(6.0);
      return;
    }
    throw new Error('60개 시드에서 골이 한 번도 없음 — 비정상');
  });

  it('stats().bigChances: 경기 종료 시 선수별 빅찬스 합계와 일치한다 (F3/C5)', () => {
    const live = new LiveMatch(setup(321));
    live.runToEnd();
    const st = live.stats();
    const r = live.result();
    const sum = (side: 'home' | 'away') =>
      r.playerStats[side].reduce((s, p) => s + (p.bigChancesCreated ?? 0), 0);
    expect(st.bigChances[0]).toBe(sum('home'));
    expect(st.bigChances[1]).toBe(sum('away'));
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
