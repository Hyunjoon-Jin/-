import { describe, it, expect } from 'vitest';
import { simulateMatch } from '../src/simulateMatch.js';
import { LiveMatch } from '../src/liveMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { MatchSetup } from '../src/types.js';

function setup(seed = 1): MatchSetup {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 14);
  const away = generateClub(rng, 'a', 'Away', 12);
  return {
    home: { club: home, tactic: defaultTactic(home) },
    away: { club: away, tactic: defaultTactic(away) },
    seed,
  };
}

function findSeedWithInjuries(): { s: MatchSetup; result: ReturnType<typeof simulateMatch> } {
  for (let seed = 1; seed < 500; seed++) {
    const s = setup(seed);
    const result = simulateMatch(s);
    if (result.injuries.length > 0) return { s, result };
  }
  throw new Error('500 시드 내 부상 이벤트를 찾지 못함 — 확률 회귀 의심');
}

describe('injuryEvents: 경기 중 부상 판정', () => {
  it('부상 이벤트는 1~90분 사이, 시간순 정렬, 유효한 side를 가진다', () => {
    const { result } = findSeedWithInjuries();
    for (let i = 0; i < result.injuries.length; i++) {
      const e = result.injuries[i]!;
      expect(e.minute).toBeGreaterThanOrEqual(1);
      expect(e.minute).toBeLessThanOrEqual(90);
      expect(['home', 'away']).toContain(e.side);
      expect(e.matches).toBeGreaterThan(0);
      if (i > 0) expect(e.minute).toBeGreaterThanOrEqual(result.injuries[i - 1]!.minute);
    }
  });

  it('동일 시드면 동일한 부상 판정 (재현성)', () => {
    const a = simulateMatch(setup(77));
    const b = simulateMatch(setup(77));
    expect(a.injuries).toEqual(b.injuries);
  });

  it('LiveMatch.injuries()는 킥오프 시점에 확정되고, 진행/전술 교체와 무관하게 동일하다', () => {
    const s = setup(77);
    const live = new LiveMatch(s);
    const early = live.injuries();
    live.runFirstHalf();
    // 하프타임에 전술을 바꿔도 부상 스케줄은 그대로(단일 소스: 킥오프 시점 확정)
    live.setTactic('home', { ...s.home.tactic, mentality: 1 });
    live.runToEnd();
    const late = live.injuries();
    expect(late).toEqual(early);
    // simulateMatch(동일 시드, 전술 변경 없음)의 최종 결과와도 일치
    expect(live.result().injuries).toEqual(early);
  });

  it('부상 이벤트의 선수는 해당 팀 선발 라인업 소속이다', () => {
    const { s, result } = findSeedWithInjuries();
    const homeIds = new Set(s.home.tactic.lineup.map((slot) => slot.playerId));
    const awayIds = new Set(s.away.tactic.lineup.map((slot) => slot.playerId));
    for (const e of result.injuries) {
      const ids = e.side === 'home' ? homeIds : awayIds;
      expect(ids.has(e.playerId)).toBe(true);
    }
  });
});
