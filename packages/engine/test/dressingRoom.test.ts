import { describe, it, expect } from 'vitest';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import {
  expectedStatus, effectiveStatus, promiseStatus,
  happinessFactors, applyDressingRoomEffects,
  holdTeamMeeting, individualTalk, persuadeToStay, rejectTransferRequest,
  resetDressingRoomForNewSeason,
  EXPECTED_SHARE, HAPPINESS_UNHAPPY, UNHAPPY_STREAK_LIMIT, teamMatchesPlayed,
} from '../src/dressingRoom.js';
import { currentAbility } from '../src/derived.js';

function club(seed = 42, n = 16) {
  return generateClub(new Rng(seed), 'c', 'Test', n);
}

describe('출전시간 기대치(A2)', () => {
  it('스쿼드 최상위 능력·성인 선수는 핵심 선수를 기대한다', () => {
    const c = club();
    const sorted = [...c.players].sort((a, b) => currentAbility(b) - currentAbility(a));
    const best = sorted.find((p) => p.age > 20)!;
    expect(expectedStatus(best, c.players)).toBe('key');
  });

  it('스쿼드 최하위 성인 선수는 후보를 기대한다', () => {
    const c = club();
    const adults = c.players.filter((p) => p.age > 20).sort((a, b) => currentAbility(a) - currentAbility(b));
    expect(expectedStatus(adults[0]!, c.players)).toBe('fringe');
  });

  it('어린 평범한 선수는 유망주를 기대한다(출전보다 성장)', () => {
    const c = club();
    // 20세 이하이면서 스쿼드 최상위(15%)가 아닌 선수를 하나 만들어 확인.
    const young = c.players[0]!;
    young.age = 18;
    // 능력치를 스쿼드 하위로 낮춰 특급이 아니게 만든다.
    for (const k of Object.keys(young.attributes) as (keyof typeof young.attributes)[]) {
      young.attributes[k] = 5;
    }
    expect(expectedStatus(young, c.players)).toBe('prospect');
  });

  it('감독이 지위를 약속하면 자연 기대치 대신 약속이 우선된다', () => {
    const c = club();
    const p = c.players.find((x) => expectedStatus(x, c.players) === 'fringe')!;
    promiseStatus(p, 'key');
    expect(effectiveStatus(p, c.players)).toBe('key');
    const f = happinessFactors(p, c.players);
    expect(f.promised).toBe(true);
    expect(f.expectedShare).toBe(EXPECTED_SHARE.key);
  });
});

describe('행복도 누적(A1)', () => {
  it('주전을 약속받고 계속 벤치에 앉으면 행복도가 하락한다', () => {
    const c = club();
    const p = c.players[0]!;
    promiseStatus(p, 'key');
    p.seasonApps = 0;
    p.happiness = 0.5;
    // 팀은 경기를 계속 치른다(다른 선수가 상시 출전 → teamMatches 확보).
    c.players[1]!.seasonApps = 12;
    for (let i = 0; i < 8; i++) applyDressingRoomEffects(c, 'D');
    expect(p.happiness!).toBeLessThan(0.4);
  });

  it('상시 출전하는 핵심 선수는 행복도가 유지·상승한다', () => {
    const c = club();
    const p = c.players[0]!;
    promiseStatus(p, 'key');
    p.seasonApps = 12; // 팀 최다 = teamMatches
    p.happiness = 0.5;
    const before = p.happiness;
    for (let i = 0; i < 8; i++) applyDressingRoomEffects(c, 'D');
    expect(p.happiness!).toBeGreaterThanOrEqual(before);
  });

  it('팀 경기수가 적으면(시즌 초반) 출전시간 요인은 반영되지 않는다', () => {
    const c = club();
    const p = c.players[0]!;
    promiseStatus(p, 'key');
    p.seasonApps = 0;
    c.players[1]!.seasonApps = 3; // teamMatches=3 < 최소치(5)
    const f = happinessFactors(p, c.players);
    expect(f.playingTime).toBe(0);
  });
});

describe('이적 요청(A3)', () => {
  it('불만이 임계 이상 연속되면 이적을 요청한다', () => {
    const c = club();
    const p = c.players[0]!;
    promiseStatus(p, 'key');
    p.seasonApps = 0;
    p.happiness = HAPPINESS_UNHAPPY - 0.05; // 이미 불만 상태에서 출발
    c.players[1]!.seasonApps = 12;
    // 패배를 반복하면 더 빨리 불만이 쌓인다.
    for (let i = 0; i < UNHAPPY_STREAK_LIMIT + 2; i++) applyDressingRoomEffects(c, 'L');
    expect(p.transferRequested).toBe(true);
    expect(p.unhappyStreak!).toBeGreaterThanOrEqual(UNHAPPY_STREAK_LIMIT);
  });

  it('설득하면 이적 요청이 철회되고 불만 카운트가 리셋된다', () => {
    const c = club();
    const p = c.players[0]!;
    p.transferRequested = true;
    p.unhappyStreak = 8;
    p.happiness = 0.2;
    persuadeToStay(p);
    expect(p.transferRequested).toBe(false);
    expect(p.unhappyStreak).toBe(0);
    expect(p.happiness).toBeGreaterThan(0.2);
  });

  it('거부하면 요청만 무시되고 곧 다시 요청할 수 있다', () => {
    const c = club();
    const p = c.players[0]!;
    p.transferRequested = true;
    p.unhappyStreak = 8;
    rejectTransferRequest(p);
    expect(p.transferRequested).toBe(false);
    expect(p.unhappyStreak).toBe(UNHAPPY_STREAK_LIMIT - 1);
  });

  it('임대 온 선수는 이 구단에 이적을 요청하지 않는다', () => {
    const c = club();
    const p = c.players[0]!;
    p.loanFromClubId = 'other';
    promiseStatus(p, 'key');
    p.seasonApps = 0;
    p.happiness = 0.1;
    c.players[1]!.seasonApps = 12;
    for (let i = 0; i < UNHAPPY_STREAK_LIMIT + 3; i++) applyDressingRoomEffects(c, 'L');
    expect(p.transferRequested ?? false).toBe(false);
  });
});

describe('감독 개입(A8·A9)', () => {
  it('팀 미팅 격려는 낮은 사기를 끌어올린다', () => {
    const c = club();
    for (const p of c.players) p.morale = 0.3;
    const avgDelta = holdTeamMeeting(c, 'encourage');
    expect(avgDelta).toBeGreaterThan(0);
    expect(c.players.every((p) => p.morale > 0.3)).toBe(true);
  });

  it('개인 면담 칭찬은 행복도와 사기를 올린다', () => {
    const c = club();
    const p = c.players[0]!;
    p.happiness = 0.5;
    p.morale = 0.5;
    individualTalk(p, 'praise');
    expect(p.happiness!).toBeGreaterThan(0.5);
    expect(p.morale).toBeGreaterThan(0.5);
  });
});

describe('결정성·시즌 경계', () => {
  it('applyDressingRoomEffects는 RNG 없이 결정적이다(동일 입력 → 동일 결과)', () => {
    const a = club(99);
    const b = club(99);
    for (let i = 0; i < 6; i++) { applyDressingRoomEffects(a, 'W'); applyDressingRoomEffects(b, 'W'); }
    for (let i = 0; i < a.players.length; i++) {
      expect(a.players[i]!.happiness).toBe(b.players[i]!.happiness);
    }
  });

  it('시즌 경계 리셋은 불만 카운트를 0으로 되돌린다', () => {
    const c = club();
    const p = c.players[0]!;
    p.unhappyStreak = 5;
    resetDressingRoomForNewSeason(p);
    expect(p.unhappyStreak).toBe(0);
  });

  it('teamMatchesPlayed는 스쿼드 최다 선발 수를 돌려준다', () => {
    const c = club();
    c.players.forEach((p, i) => { p.seasonApps = i; });
    expect(teamMatchesPlayed(c.players)).toBe(c.players.length - 1);
  });
});
