import { describe, it, expect } from 'vitest';
import { Rng } from '../src/rng.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { lineOf } from '../src/teamStrength.js';
import { ALL_ATTRS } from '../src/types.js';
import { clamp } from '../src/math.js';
import type { Club, Line } from '../src/types.js';

/**
 * AI 전술 지능화(Track 4) 회귀 테스트 — 예전엔 defaultTactic이 전 구단·전 상황에
 * 걸쳐 항상 4-3-3·중립 슬라이더(0.5/0.5/0.5)만 냈다. 스쿼드 강점에 따라 포메이션이
 * 갈리고, 상대 전력·홈/원정·빅매치 여부에 따라 공격성향이 실제로 달라지는지 검증한다.
 */
function bumpLine(club: Club, line: Line, delta: number): void {
  for (const p of club.players) {
    if (lineOf(p.position) !== line) continue;
    for (const k of ALL_ATTRS) p.attributes[k] = clamp(p.attributes[k] + delta, 1, 20);
  }
}

describe('AI 전술 지능화: 포메이션 선택', () => {
  it('공격진이 확실히 강하면 3-5-2(투톱)를 선택한다', () => {
    const rng = new Rng(2001);
    const club = generateClub(rng, 'c', 'C', 12);
    bumpLine(club, 'ATT', 6);
    bumpLine(club, 'DEF', -6);
    expect(defaultTactic(club).formation).toBe('3-5-2');
  });

  it('수비가 확실히 강하면 4-2-3-1을 선택한다', () => {
    const rng = new Rng(2002);
    const club = generateClub(rng, 'c', 'C', 12);
    bumpLine(club, 'DEF', 6);
    bumpLine(club, 'ATT', -6);
    expect(defaultTactic(club).formation).toBe('4-2-3-1');
  });

  it('균형 잡힌 스쿼드는 기존 기본값(4-3-3)을 유지한다', () => {
    const rng = new Rng(2003);
    const club = generateClub(rng, 'c', 'C', 12);
    expect(defaultTactic(club).formation).toBe('4-3-3');
  });

  it('선택된 포메이션의 라인업에는 중복 선수가 없다', () => {
    const rng = new Rng(2004);
    const club = generateClub(rng, 'c', 'C', 12);
    bumpLine(club, 'ATT', 6);
    bumpLine(club, 'DEF', -6);
    const tactic = defaultTactic(club);
    const ids = tactic.lineup.map((s) => s.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

function makeClubAtTier(seed: number, tier: number): Club {
  return generateClub(new Rng(seed), `c${seed}`, `Club${seed}`, tier);
}

describe('AI 전술 지능화: 공격성향(mentality)', () => {
  it('맥락이 전혀 없으면 예전과 같은 중립값(0.5)을 낸다(하위 호환)', () => {
    const club = makeClubAtTier(3001, 12);
    expect(defaultTactic(club).mentality).toBeCloseTo(0.5, 5);
  });

  it('약한 상대를 만나면 강한 상대를 만날 때보다 더 공격적이다', () => {
    const club = makeClubAtTier(3002, 13);
    const weakOpp = makeClubAtTier(3003, 6);
    const strongOpp = makeClubAtTier(3004, 19);
    const vsWeak = defaultTactic(club, { opponent: weakOpp }).mentality;
    const vsStrong = defaultTactic(club, { opponent: strongOpp }).mentality;
    expect(vsWeak).toBeGreaterThan(vsStrong);
  });

  it('원정이면 홈보다 소폭 더 수비적이다(동일 상대 기준)', () => {
    const club = makeClubAtTier(3005, 13);
    const opp = makeClubAtTier(3006, 13);
    const home = defaultTactic(club, { opponent: opp, isHome: true }).mentality;
    const away = defaultTactic(club, { opponent: opp, isHome: false }).mentality;
    expect(away).toBeLessThan(home);
  });

  it('빅매치는 변동폭을 눌러 평소보다 중립값에 가깝다', () => {
    const club = makeClubAtTier(3007, 18);
    const weakOpp = makeClubAtTier(3008, 6);
    const normal = defaultTactic(club, { opponent: weakOpp }).mentality;
    const bigMatch = defaultTactic(club, { opponent: weakOpp, isBigMatch: true }).mentality;
    expect(Math.abs(bigMatch - 0.5)).toBeLessThan(Math.abs(normal - 0.5));
  });

  it('mentality는 항상 유효 범위([0,1]) 안에 있다', () => {
    const club = makeClubAtTier(3009, 20);
    const weakOpp = makeClubAtTier(3010, 1);
    const m = defaultTactic(club, { opponent: weakOpp, isHome: true }).mentality;
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThanOrEqual(1);
  });
});

describe('AI 전술 지능화: 압박강도(pressing)', () => {
  it('빅매치는 평소보다 압박강도가 낮다(무리한 압박 자제)', () => {
    const club = makeClubAtTier(3011, 13);
    const normal = defaultTactic(club).pressing;
    const bigMatch = defaultTactic(club, { isBigMatch: true }).pressing;
    expect(bigMatch).toBeLessThan(normal);
  });
});

describe('AI 전술 지능화: 폭(width)·수비라인(defensiveLine)', () => {
  it('3-5-2(윙백)를 쓰는 스쿼드는 4-2-3-1(더블 피벗)을 쓰는 스쿼드보다 폭이 넓다', () => {
    const wide = generateClub(new Rng(4001), 'c', 'C', 12);
    bumpLine(wide, 'ATT', 6);
    bumpLine(wide, 'DEF', -6);
    const narrow = generateClub(new Rng(4002), 'c', 'C', 12);
    bumpLine(narrow, 'DEF', 6);
    bumpLine(narrow, 'ATT', -6);
    expect(defaultTactic(wide).formation).toBe('3-5-2');
    expect(defaultTactic(narrow).formation).toBe('4-2-3-1');
    expect(defaultTactic(wide).width).toBeGreaterThan(defaultTactic(narrow).width);
  });

  it('공격적인 팀(mentality 높음)은 수비라인도 함께 높인다(일관된 스타일)', () => {
    const club = makeClubAtTier(4003, 13);
    const weakOpp = makeClubAtTier(4004, 4);
    const strongOpp = makeClubAtTier(4005, 20);
    const attacking = defaultTactic(club, { opponent: weakOpp });
    const defensive = defaultTactic(club, { opponent: strongOpp });
    expect(attacking.mentality).toBeGreaterThan(defensive.mentality);
    expect(attacking.defensiveLine).toBeGreaterThan(defensive.defensiveLine);
  });

  it('width·defensiveLine은 항상 유효 범위([0,1]) 안에 있다', () => {
    const club = makeClubAtTier(4006, 20);
    const weakOpp = makeClubAtTier(4007, 1);
    const t = defaultTactic(club, { opponent: weakOpp, isHome: true });
    expect(t.width).toBeGreaterThanOrEqual(0);
    expect(t.width).toBeLessThanOrEqual(1);
    expect(t.defensiveLine).toBeGreaterThanOrEqual(0);
    expect(t.defensiveLine).toBeLessThanOrEqual(1);
  });
});
