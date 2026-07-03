import { describe, it, expect } from 'vitest';
import {
  createCup, playCupRound, playCupToEnd, cupSurvivors, isCupOver, nextCupPairings,
  CUP_FINAL_ROUND_NAME,
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

describe('cup: 시드 격리(리그와의 충돌 회귀 테스트)', () => {
  it('컵 대진 시드가 같은 시즌의 리그 경기 시드 범위와 절대 겹치지 않는다', () => {
    // 앱(game.ts)의 실제 공식과 동일하게 리그/컵 베이스 시드를 구성 — 예전엔
    // cup.baseSeed + round*1000 + i 공식이 season*1000 패턴과 선형 관계로 얽혀,
    // 특정 라운드·픽스처 조합에서 리그 경기와 정확히 같은 시드가 나왔었다.
    const clubs = makeClubs(16, 42);
    const seed = 100;
    const season = 1;
    const leagueBaseSeed = seed + season * 1000 + 2; // seasonSeed(state) 공식
    const cupBaseSeed = seed + season * 1000 + 4;    // 컵 생성 시 game.ts가 넘기는 값
    // 향후 여러 시즌의 리그 픽스처 시드 범위까지 폭넓게 확인(더블 라운드로빈 최대 픽스처 수 여유 포함).
    const leagueSeeds = new Set<number>();
    for (let s = 0; s < 30; s++) {
      for (let cursor = 0; cursor < 200; cursor++) leagueSeeds.add(seed + s * 1000 + 2 + cursor);
    }

    let cup = createCup(clubs, cupBaseSeed);
    for (let round = 0; round < 6 && !isCupOver(cup); round++) {
      const next = nextCupPairings(cup, clubs);
      if (!next) break;
      for (const pr of next.pairings) {
        expect(leagueSeeds.has(pr.seed)).toBe(false);
      }
      cup = playCupRound(cup, clubs);
    }
    expect(leagueSeeds.has(leagueBaseSeed)).toBe(true); // 위 Set 구성 자체가 유효한지 자기 점검
  });
});

describe('cup: 부전승 공정성(회귀 테스트)', () => {
  it('최상위 평판 구단이 이미 부전승을 받았다면, 다음 홀수 라운드에서 다시 받지 않는다', () => {
    // 5개 구단 → 5(홀수, 부전승)→3(홀수, 부전승)→2(결승) 순으로 홀수 라운드가 두 번 온다.
    const clubs = makeClubs(5, 7);
    clubs.forEach((c, i) => { c.finance.reputation = 20 - i; }); // c0이 항상 최상위 평판
    let cup = createCup(clubs, 500);

    const first = nextCupPairings(cup, clubs)!;
    expect(first.byeId).toBe('c0'); // 첫 홀수 라운드는 예전과 동일하게 최상위가 받는다
    cup = playCupRound(cup, clubs);

    const survivors2 = cupSurvivors(cup);
    expect(survivors2).toContain('c0'); // 부전승으로 자동 진출
    expect(survivors2.length % 2).toBe(1); // 5→3, 여전히 홀수

    const second = nextCupPairings(cup, clubs)!;
    expect(second.byeId).not.toBe('c0'); // 이미 부전승을 받았으니 이번엔 다른 구단이 받는다
  });
});

describe('cup: 라운드 이름(결승까지 남은 라운드 수 기준)', () => {
  it('생존자 2명은 결승, 3~4명은 준결승, 5~8명은 8강, 9~16명은 16강으로 표시된다', () => {
    // 24개 구단 → 24(16강 이상)→12(8강)→6(8강, 부전승 없음... 실제로는 6=8강 버킷)→3(준결승)→2(결승)
    const clubs = makeClubs(24, 1);
    let cup = createCup(clubs, 200);
    const seen: { survivors: number; name: string }[] = [];
    for (let round = 0; round < 8 && !isCupOver(cup); round++) {
      const next = nextCupPairings(cup, clubs);
      if (!next) break;
      seen.push({ survivors: cupSurvivors(cup).length, name: next.roundName });
      cup = playCupRound(cup, clubs);
    }
    for (const { survivors, name } of seen) {
      if (survivors <= 2) expect(name).toBe(CUP_FINAL_ROUND_NAME);
      else if (survivors <= 4) expect(name).toBe('준결승');
      else if (survivors <= 8) expect(name).toBe('8강');
      else if (survivors <= 16) expect(name).toBe('16강');
      else expect(name).toBe('예선');
    }
    // 마지막으로 관찰된 라운드가 결승이어야 한다(그 다음이 챔피언 결정).
    expect(seen[seen.length - 1]!.name).toBe(CUP_FINAL_ROUND_NAME);
  });
});

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
