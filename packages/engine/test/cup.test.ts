import { describe, it, expect } from 'vitest';
import { createCup, playCupRound, playCupToEnd, cupSurvivors, isCupOver } from '../src/cup.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function makeClubs(n: number, seed = 1): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < n; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 8 + (i % 9)));
  return clubs;
}

describe('cup: 녹아웃 토너먼트', () => {
  it('생성 시 전 구단이 참가하고 챔피언은 미정', () => {
    const clubs = makeClubs(12);
    const cup = createCup(clubs, 100);
    expect(cup.participantIds).toHaveLength(12);
    expect(cup.championId).toBeNull();
    expect(cupSurvivors(cup)).toHaveLength(12);
  });

  it('라운드마다 생존 구단이 줄고 결국 챔피언 1명', () => {
    const clubs = makeClubs(12);
    let cup = createCup(clubs, 100);
    const counts = [cupSurvivors(cup).length];
    let guard = 20;
    while (!isCupOver(cup) && guard-- > 0) {
      cup = playCupRound(cup, clubs);
      counts.push(cupSurvivors(cup).length);
    }
    expect(isCupOver(cup)).toBe(true);
    expect(cup.championId).not.toBeNull();
    // 생존 수가 단조 감소
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    }
  });

  it('모든 타이의 승자는 그 경기 참가자 중 하나다', () => {
    const clubs = makeClubs(12);
    const cup = playCupToEnd(createCup(clubs, 7), clubs);
    for (const round of cup.rounds) {
      for (const tie of round.ties) {
        const valid = tie.awayId === null
          ? [tie.homeId]
          : [tie.homeId, tie.awayId];
        expect(valid).toContain(tie.winnerId);
      }
    }
  });

  it('챔피언은 참가 구단 중 하나', () => {
    const clubs = makeClubs(12);
    const cup = playCupToEnd(createCup(clubs, 3), clubs);
    expect(cup.participantIds).toContain(cup.championId);
  });

  it('같은 시드는 같은 챔피언 (재현성)', () => {
    const a = playCupToEnd(createCup(makeClubs(12, 5), 42), makeClubs(12, 5));
    const b = playCupToEnd(createCup(makeClubs(12, 5), 42), makeClubs(12, 5));
    expect(a.championId).toBe(b.championId);
    expect(a.rounds.length).toBe(b.rounds.length);
  });

  it('홀수 생존 시 부전승(awayId null)이 발생한다', () => {
    // 6→3 라운드 후 3강에서 홀수 부전승 발생
    const clubs = makeClubs(12, 9);
    const cup = playCupToEnd(createCup(clubs, 11), clubs);
    const hasBye = cup.rounds.some((r) => r.ties.some((t) => t.awayId === null));
    expect(hasBye).toBe(true);
  });
});
