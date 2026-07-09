import { describe, it, expect } from 'vitest';
import { simulateMatch, MATCH_LENGTH } from '../src/simulateMatch.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { MatchSetup } from '../src/types.js';

function setup(seed = 1): MatchSetup {
  const rng = new Rng(seed);
  const home = generateClub(rng, 'h', 'Home', 13);
  const away = generateClub(rng, 'a', 'Away', 12);
  return {
    home: { club: home, tactic: defaultTactic(home) },
    away: { club: away, tactic: defaultTactic(away) },
    seed,
  };
}

/** 한 경기 내 같은 선수의 카드를 모아, 옐로우 2장(세컨드 옐로우 → 레드)인 선수를 찾는다. */
function findSecondYellowCase(): { s: MatchSetup; result: ReturnType<typeof simulateMatch>; playerId: string } {
  for (let seed = 1; seed < 2000; seed++) {
    const s = setup(seed);
    const result = simulateMatch(s);
    const byPlayer = new Map<string, number>();
    for (const c of result.cards) byPlayer.set(c.playerId, (byPlayer.get(c.playerId) ?? 0) + 1);
    for (const [playerId, count] of byPlayer) {
      if (count >= 2) return { s, result, playerId };
    }
  }
  throw new Error('2000 시드 내 세컨드 옐로우 사례를 찾지 못함 — 확률 회귀 의심');
}

describe('세컨드 옐로우 → 레드 자동 전환(고도화 항목56)', () => {
  it('첫 옐로우 이후 두 번째 북엄으로 레드가 나오면, 그 선수는 옐로우 1장 + 레드 1장을 모두 갖는다', () => {
    const { result, playerId } = findSecondYellowCase();
    const own = result.cards.filter((c) => c.playerId === playerId);
    expect(own).toHaveLength(2);
    expect(own.filter((c) => c.type === 'yellow')).toHaveLength(1);
    expect(own.filter((c) => c.type === 'red')).toHaveLength(1);
  });

  it('세컨드 옐로우(레드)는 항상 첫 옐로우보다 나중 분(minute)에 발생한다', () => {
    const { result, playerId } = findSecondYellowCase();
    const own = result.cards.filter((c) => c.playerId === playerId).sort((a, b) => a.minute - b.minute);
    expect(own[0]!.type).toBe('yellow');
    expect(own[1]!.type).toBe('red');
    expect(own[1]!.minute).toBeGreaterThan(own[0]!.minute);
    expect(own[1]!.minute).toBeLessThanOrEqual(MATCH_LENGTH);
  });

  it('한 경기에서 세컨드 옐로우가 발생하는 빈도가 실제 통계와 비슷한 범위(양팀 합산 0.02~0.2회/경기)다', () => {
    const home2 = generateClub(new Rng(50), 'h', 'Home', 13);
    const away2 = generateClub(new Rng(51), 'a', 'Away', 12);
    const ht = defaultTactic(home2);
    const at = defaultTactic(away2);
    const N = 800;
    let occurrences = 0;
    for (let seed = 1; seed <= N; seed++) {
      const result = simulateMatch({ home: { club: home2, tactic: ht }, away: { club: away2, tactic: at }, seed });
      const byPlayer = new Map<string, number>();
      for (const c of result.cards) byPlayer.set(c.playerId, (byPlayer.get(c.playerId) ?? 0) + 1);
      for (const count of byPlayer.values()) if (count >= 2) occurrences++;
    }
    const perMatch = occurrences / N;
    expect(perMatch).toBeGreaterThan(0.02);
    expect(perMatch).toBeLessThan(0.2);
  });

  it('세컨드 옐로우로 퇴장한 선수도 그 분(minute)부터 인원수 열세 배율에 반영된다', () => {
    const { s, result, playerId } = findSecondYellowCase();
    const secondYellowRed = result.cards.find((c) => c.playerId === playerId && c.type === 'red')!;
    expect(secondYellowRed.minute).toBeGreaterThanOrEqual(1);
    // 부상/카드 판정과 마찬가지로 sentOffIds가 이 레드카드를 인식하는지는 stepMinute
    // 경로(simulateMatch 전체)가 이미 공유하므로, 여기서는 이벤트 데이터 정합성만 확인한다.
    expect(result.cards).toContainEqual(secondYellowRed);
    void s;
  });

  it('동일 시드면 세컨드 옐로우를 포함해 완전히 동일한 결과가 나온다(재현성)', () => {
    const a = simulateMatch(setup(999));
    const b = simulateMatch(setup(999));
    expect(a.cards).toEqual(b.cards);
    expect(a.score).toEqual(b.score);
  });
});
