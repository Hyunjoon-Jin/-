import { describe, it, expect } from 'vitest';
import { doubleRoundRobin } from '../src/schedule.js';
import {
  createSeasonState, playRound, playNext, playToEnd, computeTable,
  isSeasonOver, totalRounds, currentRound, tacticFor, positionHistory,
  type SeasonState,
} from '../src/season.js';
import { simulateSeason } from '../src/league.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { recentForm } from '../src/form.js';
import { Rng } from '../src/rng.js';
import type { Club, MatchResult } from '../src/types.js';
import type { Fixture } from '../src/schedule.js';

/** computeTable에 필요한 필드만 채운 최소 가짜 결과(경기 시뮬레이션 없이 순위표 로직만 검증). */
function fakeResult(homeId: string, awayId: string, score: [number, number]): MatchResult {
  return {
    homeClubId: homeId, awayClubId: awayId, homeClubName: homeId, awayClubName: awayId,
    score, possession: [50, 50], shots: [0, 0], events: [], cards: [], injuries: [],
    playerStats: { home: [], away: [] }, seed: 0,
  };
}

function makeClubs(n: number, seed = 1): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < n; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 12));
  return clubs;
}

describe('schedule: 더블 라운드 로빈', () => {
  it('n팀이면 n*(n-1)경기, 2*(n-1)라운드', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const fx = doubleRoundRobin(ids);
    const n = ids.length;
    expect(fx.length).toBe(n * (n - 1));
    expect(Math.max(...fx.map((f) => f.round))).toBe(2 * (n - 1));
  });

  it('각 팀은 모든 상대와 홈/원정 한 번씩 만난다', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const fx = doubleRoundRobin(ids);
    const pairs = new Set(fx.map((f) => `${f.homeId}>${f.awayId}`));
    expect(pairs.size).toBe(fx.length); // 중복 없음
    for (const h of ids) for (const a of ids) {
      if (h !== a) expect(pairs.has(`${h}>${a}`)).toBe(true);
    }
  });

  it('한 라운드에 모든 팀이 정확히 한 번 등장한다 (짝수 팀)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const fx = doubleRoundRobin(ids);
    const rounds = new Map<number, string[]>();
    for (const f of fx) {
      const arr = rounds.get(f.round) ?? [];
      arr.push(f.homeId, f.awayId);
      rounds.set(f.round, arr);
    }
    for (const [, teams] of rounds) {
      expect(teams.sort()).toEqual([...ids].sort());
    }
  });
});

describe('season: 상태 기반 진행', () => {
  it('라운드 단위로 진행하면 라운드 번호가 1씩 오른다', () => {
    const s = createSeasonState(makeClubs(6), 100);
    expect(currentRound(s)).toBe(1);
    playRound(s);
    expect(currentRound(s)).toBe(2);
    expect(s.results.length).toBe(3); // 6팀 → 라운드당 3경기
  });

  it('playToEnd 후 시즌 종료, 모든 경기 소진', () => {
    const clubs = makeClubs(6);
    const s = createSeasonState(clubs, 100);
    playToEnd(s);
    expect(isSeasonOver(s)).toBe(true);
    expect(s.results.length).toBe(6 * 5);
    // 모든 팀이 2*(n-1)=10경기를 치른다
    const table = computeTable(s);
    for (const row of table) expect(row.played).toBe(10);
  });

  it('상태 기반 결과가 simulateSeason(일괄)과 정확히 일치한다', () => {
    const a = makeClubs(8, 5);
    const b = makeClubs(8, 5);
    const viaState = (() => {
      const s = createSeasonState(a, 999);
      playToEnd(s);
      return computeTable(s);
    })();
    const viaBatch = simulateSeason(b, 999).table;
    expect(viaState.map((r) => `${r.name}:${r.points}`))
      .toEqual(viaBatch.map((r) => `${r.name}:${r.points}`));
  });

  it('playNext는 한 경기씩, 같은 시드는 같은 결과', () => {
    const s1 = createSeasonState(makeClubs(6, 7), 42);
    const s2 = createSeasonState(makeClubs(6, 7), 42);
    const r1 = playNext(s1);
    const r2 = playNext(s2);
    expect(r1.score).toEqual(r2.score);
    expect(totalRounds(s1)).toBe(10);
  });

  it('구단 1개로는 리그가 성립하지 않아 에러를 던진다', () => {
    expect(() => createSeasonState(makeClubs(1), 1)).toThrow();
  });

  it('알 수 없는 클럽을 참조하는 결과가 섞이면 조용히 버리지 않고 에러를 던진다', () => {
    const clubs = makeClubs(3, 3);
    const s = createSeasonState(clubs, 1);
    s.results.push(fakeResult(clubs[0]!.id, 'ghost-club', [1, 0]));
    expect(() => computeTable(s)).toThrow();
  });

  it('승점·득실차·득점이 모두 같으면 상대전적으로 동률을 가른다', () => {
    const [cA, cB, cC] = makeClubs(3, 11);
    const clubs = [cA!, cB!, cC!];
    const idA = cA!.id; const idB = cB!.id; const idC = cC!.id;
    const s: SeasonState = {
      clubs, fixtures: [], cursor: 0, baseSeed: 1,
      results: [
        fakeResult(idA, idB, [0, 0]),
        fakeResult(idB, idA, [0, 1]), // A가 상대전적에서 우위(1무 1승)
        fakeResult(idA, idC, [0, 1]),
        fakeResult(idC, idA, [0, 1]),
        fakeResult(idB, idC, [1, 0]),
        fakeResult(idC, idB, [0, 1]),
      ],
    };
    const table = computeTable(s);
    const a = table.find((r) => r.clubId === idA)!;
    const b = table.find((r) => r.clubId === idB)!;
    const c = table.find((r) => r.clubId === idC)!;
    // A와 B는 승점·득실차·득점이 완전히 동일 — 상대전적(A가 1무1승으로 우위)으로만 갈린다
    expect(a.points).toBe(b.points);
    expect(a.gf - a.ga).toBe(b.gf - b.ga);
    expect(a.gf).toBe(b.gf);
    expect(c.points).toBeLessThan(a.points); // C는 동률 그룹 밖(비교 대상 아님)
    expect(table.indexOf(a)).toBeLessThan(table.indexOf(b));
  });
});

describe('tacticFor: AI 전술이 홈/원정 폼을 구분해 반영한다(고도화 항목23)', () => {
  it('tactics 맵에 없으면 이번 경기와 같은 구장 조건(홈이면 홈, 원정이면 원정)의 최근 폼만 반영한다', () => {
    const [clubA, clubB] = makeClubs(2, 77);
    // A의 홈 3연패 + 원정 3연승을 섞어 쌓는다 — 블렌드 폼이면 상쇄되지만,
    // 구장 조건을 가리면 홈 전술엔 3연패만, 원정 전술엔 3연승만 반영돼야 한다.
    const results: MatchResult[] = [
      fakeResult(clubA.id, clubB.id, [0, 2]),
      fakeResult(clubB.id, clubA.id, [0, 2]),
      fakeResult(clubA.id, clubB.id, [0, 3]),
      fakeResult(clubB.id, clubA.id, [0, 3]),
      fakeResult(clubA.id, clubB.id, [1, 4]),
      fakeResult(clubB.id, clubA.id, [0, 4]),
    ];

    const homeTactic = tacticFor(clubA, clubB, true, undefined, results);
    const awayTactic = tacticFor(clubA, clubB, false, undefined, results);

    const expectedHomeForm = recentForm(results, clubA.id, 5, 'home');
    const expectedAwayForm = recentForm(results, clubA.id, 5, 'away');
    const expectedHome = defaultTactic(clubA, {
      opponent: clubB, isHome: true,
      recentFormPoints: (expectedHomeForm.points / expectedHomeForm.results.length) * 5,
    });
    const expectedAway = defaultTactic(clubA, {
      opponent: clubB, isHome: false,
      recentFormPoints: (expectedAwayForm.points / expectedAwayForm.results.length) * 5,
    });

    expect(homeTactic.mentality).toBeCloseTo(expectedHome.mentality, 10);
    expect(awayTactic.mentality).toBeCloseTo(expectedAway.mentality, 10);
    // 홈에서는 3연패(과감해짐), 원정에서는 3연승(신중해짐) 중이므로 방향이 뚜렷이 갈린다.
    expect(homeTactic.mentality).toBeGreaterThan(awayTactic.mentality);
  });

  it('tactics 맵에 club이 있으면 그 전술을 그대로 쓴다(기존 동작 유지)', () => {
    const [clubA, clubB] = makeClubs(2, 78);
    const fixed = defaultTactic(clubA);
    const tactics = new Map([[clubA.id, fixed]]);
    expect(tacticFor(clubA, clubB, true, tactics, [])).toBe(fixed);
  });
});

describe('positionHistory: 시즌 순위 추이 (고도화 항목26)', () => {
  function fx(round: number, homeId: string, awayId: string): Fixture {
    return { round, homeId, awayId };
  }

  it('라운드가 끝날 때마다 순위가 갱신되고, 최종 순위는 computeTable과 일치한다', () => {
    const [a, b, c] = makeClubs(3, 200);
    const fixtures: Fixture[] = [
      fx(1, a.id, b.id), fx(1, c.id, a.id),
      fx(2, b.id, c.id), fx(2, a.id, b.id),
    ];
    // A가 라운드1엔 이겨서 선두, 라운드2엔 져서 순위가 내려가는 시나리오.
    const results: MatchResult[] = [
      fakeResult(a.id, b.id, [2, 0]), // A 승
      fakeResult(c.id, a.id, [0, 0]), // 무관 매치(다른 조합)
      fakeResult(b.id, c.id, [1, 1]),
      fakeResult(a.id, b.id, [0, 3]), // A 패
    ];
    const history = positionHistory([a, b, c], fixtures, results, a.id);
    expect(history).toHaveLength(2);
    const finalTable = computeTable({ clubs: [a, b, c], fixtures, results, cursor: 0, baseSeed: 0 });
    const finalPos = finalTable.findIndex((r) => r.clubId === a.id) + 1;
    expect(history[history.length - 1]).toBe(finalPos);
  });

  it('경기가 없으면 빈 배열', () => {
    const [a, b] = makeClubs(2, 201);
    expect(positionHistory([a, b], [], [], a.id)).toEqual([]);
  });
});
