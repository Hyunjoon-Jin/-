import { describe, it, expect } from 'vitest';
import { createContext, stepMinute, manDownMultiplier, MATCH_LENGTH } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';

function matchup(seed = 1) {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
}

describe('manDownMultiplier (고도화 항목41: 퇴장 시 전력 손실)', () => {
  it('퇴장 없으면 배율 1', () => {
    expect(manDownMultiplier(0)).toBe(1);
  });

  it('1명 퇴장 시 전력이 감소한다', () => {
    const m = manDownMultiplier(1);
    expect(m).toBeLessThan(1);
    expect(m).toBeGreaterThan(0.8);
  });

  it('2명 퇴장은 1명보다 더 크게 감소(거듭 곱)한다', () => {
    expect(manDownMultiplier(2)).toBeLessThan(manDownMultiplier(1));
    expect(manDownMultiplier(2)).toBeCloseTo(manDownMultiplier(1) ** 2, 10);
  });
});

describe('stepMinute: 레드카드로 인한 인원수 열세가 실제 전력에 반영된다(고도화 항목41)', () => {
  it('1분에 퇴장당한 팀은 그렇지 않은 동일 조건 대비 평균 슈팅이 줄어든다(다수 시드 누적 비교)', () => {
    const { home, away, ht, at } = matchup(55);

    function runShots(seed: number, injectRedCardOnHome: boolean): number {
      const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      const firstHomePlayer = ht.lineup[1]!.playerId; // GK(0번) 제외
      ctx.cards = injectRedCardOnHome
        ? [{ minute: 1, side: 'home', playerId: firstHomePlayer, playerName: 'x', type: 'red' }]
        : [];
      for (let minute = 1; minute <= MATCH_LENGTH; minute++) stepMinute(ctx, minute);
      return ctx.home.shots;
    }

    const N = 150;
    let withRedCardTotal = 0;
    let withoutRedCardTotal = 0;
    for (let seed = 1; seed <= N; seed++) {
      withRedCardTotal += runShots(seed, true);
      withoutRedCardTotal += runShots(seed, false);
    }
    expect(withRedCardTotal / N).toBeLessThan(withoutRedCardTotal / N);
  });

  it('퇴장당한 선수는 이후 분에서 슈터로 선택되지 않는다', () => {
    const { home, away, ht, at } = matchup(9);
    const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed: 9 });
    const sentOffId = ht.lineup[1]!.playerId;
    ctx.cards = [{ minute: 1, side: 'home', playerId: sentOffId, playerName: 'x', type: 'red' }];
    for (let minute = 1; minute <= MATCH_LENGTH; minute++) stepMinute(ctx, minute);
    const st = ctx.statMap.get(sentOffId);
    expect(st?.shots ?? 0).toBe(0);
  });
});
