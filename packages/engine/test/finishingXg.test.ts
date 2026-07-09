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

describe('개인 결정력(finishing) 능력치 골 확률 직접 반영(고도화 항목53)', () => {
  it('결정력이 높은 선수는 낮은 선수보다 같은 조건에서 평균적으로 골을 더 많이 넣는다(다수 시드 누적 비교)', () => {
    const { home, away, ht, at } = matchup(90);
    const slot = ht.lineup.find((s) => s.position === 'ST') ?? ht.lineup.find((s) => s.position !== 'GK')!;

    function totalGoals(seed: number, finishing: number): number {
      const p = home.players.find((pl) => pl.id === slot.playerId)!;
      const original = p.attributes.finishing;
      p.attributes.finishing = finishing;
      const ctx = createContext({ home: { club: home, tactic: ht }, away: { club: away, tactic: at }, seed });
      for (let minute = 1; minute <= MATCH_LENGTH; minute++) stepMinute(ctx, minute);
      p.attributes.finishing = original;
      return ctx.statMap.get(p.id)?.goals ?? 0;
    }

    const N = 400;
    let highTotal = 0;
    let lowTotal = 0;
    for (let seed = 1; seed <= N; seed++) {
      highTotal += totalGoals(seed, 20);
      lowTotal += totalGoals(seed, 1);
    }
    expect(highTotal).toBeGreaterThan(lowTotal);
  });

  it('세트피스 찬스에는 결정력이 아니라 setPiece 능력치만 반영된다(이중 반영 방지)', () => {
    const { home, away, ht, at } = matchup(91);
    const slot = ht.lineup.find((s) => s.position !== 'GK')!;

    function setPieceGoals(seed: number, finishing: number): number {
      const p = home.players.find((pl) => pl.id === slot.playerId)!;
      const originalFinishing = p.attributes.finishing;
      const originalSetPiece = p.attributes.setPiece;
      p.attributes.finishing = finishing;
      p.attributes.setPiece = 10; // 세트피스 능력치는 고정 — 결정력만 변화
      // 세트피스 전담자로 지정해 이 선수가 세트피스 슈팅을 몰아 받도록 한다.
      const tacticWithTaker = { ...ht, setPieceTakerId: p.id };
      const ctx = createContext({
        home: { club: home, tactic: tacticWithTaker }, away: { club: away, tactic: at }, seed,
      });
      for (let minute = 1; minute <= MATCH_LENGTH; minute++) stepMinute(ctx, minute);
      const goals = ctx.statMap.get(p.id)?.goals ?? 0;
      p.attributes.finishing = originalFinishing;
      p.attributes.setPiece = originalSetPiece;
      return goals;
    }

    const N = 300;
    let highTotal = 0;
    let lowTotal = 0;
    for (let seed = 1; seed <= N; seed++) {
      highTotal += setPieceGoals(seed, 20);
      lowTotal += setPieceGoals(seed, 1);
    }
    // 결정력 차이만으로는 세트피스 득점에 유의미한 차이가 나지 않아야 한다(대략 비슷한 범위).
    expect(Math.abs(highTotal - lowTotal)).toBeLessThan(Math.max(highTotal, lowTotal) * 0.5 + 5);
  });
});
