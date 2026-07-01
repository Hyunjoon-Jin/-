import { describe, it, expect } from 'vitest';
import {
  createCup, playCupRound, playCupToEnd, cupSurvivors, isCupOver, nextCupPairings,
} from '../src/cup.js';
import { simulateMatch } from '../src/simulateMatch.js';
import { defaultTactic } from '../src/generate.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club, MatchResult } from '../src/types.js';

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

  it('nextCupPairings 대진이 실제 진행 결과와 일치한다', () => {
    const clubs = makeClubs(12, 4);
    const cup = createCup(clubs, 50);
    const next = nextCupPairings(cup, clubs)!;
    const played = playCupRound(cup, clubs);
    const realPairs = played.rounds[0]!.ties
      .filter((t) => t.awayId !== null)
      .map((t) => `${t.homeId}-${t.awayId}`);
    const predicted = next.pairings.map((p) => `${p.homeId}-${p.awayId}`);
    expect(predicted).toEqual(realPairs);
  });

  it('watched 결과를 주면 해당 대진에 그 결과가 반영된다', () => {
    const clubs = makeClubs(12, 8);
    const cup = createCup(clubs, 60);
    const next = nextCupPairings(cup, clubs)!;
    const pr = next.pairings[0]!;
    const home = clubs.find((c) => c.id === pr.homeId)!;
    const away = clubs.find((c) => c.id === pr.awayId)!;
    // 원정 5:0 대승으로 관전 결과를 조작
    const base = simulateMatch({
      home: { club: home, tactic: defaultTactic(home) },
      away: { club: away, tactic: defaultTactic(away) },
      seed: pr.seed,
    });
    const watched: MatchResult = { ...base, score: [0, 5] };

    const played = playCupRound(cup, clubs, undefined, watched);
    const tie = played.rounds[0]!.ties.find((t) => t.homeId === pr.homeId && t.awayId === pr.awayId)!;
    expect(tie.homeScore).toBe(0);
    expect(tie.awayScore).toBe(5);
    expect(tie.winnerId).toBe(pr.awayId);
  });
});
