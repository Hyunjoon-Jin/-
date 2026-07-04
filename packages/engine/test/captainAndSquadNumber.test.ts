import { describe, it, expect } from 'vitest';
import { applyMatchEffects } from '../src/matchEffects.js';
import { generateClub, defaultTactic, assignSquadNumber } from '../src/generate.js';
import { buyPlayerAt } from '../src/transferActions.js';
import { Rng } from '../src/rng.js';
import type { Club, MatchResult, Player, Tactic } from '../src/types.js';

/**
 * 주장 임명 + 등번호(Phase 5 교차 스윕 A12/A13) 회귀 테스트.
 * 예전엔 Tactic에 주장 개념이 아예 없었고(리더 특성은 franchise.ts의 스쿼드 전체
 * 사기 계산에만 쓰임), 선수에게 등번호도 없었다.
 */
function fakeResult(home: Club, away: Club, hg: number, ag: number): MatchResult {
  return {
    homeClubId: home.id, awayClubId: away.id,
    homeClubName: home.name, awayClubName: away.name,
    score: [hg, ag], possession: [50, 50], shots: [0, 0],
    events: [], cards: [], injuries: [], playerStats: { home: [], away: [] }, seed: 1,
  };
}

describe('주장 자동 지정', () => {
  it('defaultTactic은 라인업 중 리더 특성 보유자를 리더십 능력치 기준으로 주장으로 고른다', () => {
    const rng = new Rng(20);
    const club = generateClub(rng, 'c', 'C', 13);
    // 리더 특성이 하나도 없을 수 있으니 라인업 첫 선수에게 확실히 부여
    const tacticProbe = defaultTactic(club);
    const leaderId = tacticProbe.lineup[0]!.playerId;
    const leader = club.players.find((p) => p.id === leaderId)!;
    leader.traits = ['leader'];
    leader.attributes.leadership = 20;
    const tactic = defaultTactic(club);
    expect(tactic.captainId).toBe(leaderId);
  });

  it('리더 특성 보유자가 없으면 라인업 중 리더십 능력치가 가장 높은 선수를 고른다', () => {
    const rng = new Rng(21);
    const club = generateClub(rng, 'c', 'C', 13);
    for (const p of club.players) p.traits = p.traits.filter((t) => t !== 'leader');
    const tactic = defaultTactic(club);
    const byId = new Map(club.players.map((p) => [p.id, p]));
    const inLineup = tactic.lineup.map((s) => byId.get(s.playerId)!);
    const best = [...inLineup].sort((a, b) => b.attributes.leadership - a.attributes.leadership)[0]!;
    expect(tactic.captainId).toBe(best.id);
  });
});

describe('주장 결장 페널티', () => {
  function setup() {
    const rng = new Rng(22);
    const home = generateClub(rng, 'h', 'Home', 13);
    const away = generateClub(rng, 'a', 'Away', 13);
    for (const c of [home, away]) for (const p of c.players) p.condition = 0.5;
    return { home, away, ht: defaultTactic(home), at: defaultTactic(away) };
  }

  it('주장이 라인업에 없으면(결장) 팀 전체 사기가 추가로 소폭 깎인다', () => {
    const a = setup();
    const b = setup();
    // a는 주장이 결장(다른 선수로 교체), b는 그대로 유지
    const captainId = a.ht.lineup[0]!.playerId;
    const benchPlayer = a.home.players.find((p) => !a.ht.lineup.some((s) => s.playerId === p.id))!;
    const brokenLineup = a.ht.lineup.map((s) => (s.playerId === captainId ? { ...s, playerId: benchPlayer.id } : s));
    const htWithoutCaptain: Tactic = { ...a.ht, lineup: brokenLineup, captainId };

    applyMatchEffects(a.home, htWithoutCaptain, a.away, a.at, fakeResult(a.home, a.away, 1, 1), new Rng(1));
    applyMatchEffects(b.home, b.ht, b.away, b.at, fakeResult(b.home, b.away, 1, 1), new Rng(1));

    // 무승부(dMorale=0)라 순수 페널티만 비교 가능한 선수로 비교
    const untouchedId = a.ht.lineup.find((s) => s.playerId !== captainId)!.playerId;
    const withPenalty = a.home.players.find((p) => p.id === untouchedId)!;
    const without = b.home.players.find((p) => p.id === untouchedId)!;
    expect(withPenalty.morale).toBeLessThan(without.morale);
  });

  it('주장을 지정하지 않으면(undefined) 페널티가 없다', () => {
    const a = setup();
    const b = setup();
    const noCaptainTactic: Tactic = { ...a.ht, captainId: undefined };
    applyMatchEffects(a.home, noCaptainTactic, a.away, a.at, fakeResult(a.home, a.away, 0, 0), new Rng(2));
    applyMatchEffects(b.home, b.ht, b.away, b.at, fakeResult(b.home, b.away, 0, 0), new Rng(2));
    // b.ht에 캡틴이 있고 라인업에 있으므로 페널티 없음 — 둘 다 페널티 없이 동일해야 함
    expect(a.home.players.map((p) => p.morale)).toEqual(b.home.players.map((p) => p.morale));
  });
});

describe('등번호 배정', () => {
  it('구단 생성 시 전원에게 겹치지 않는 등번호(1~99)가 배정된다', () => {
    const rng = new Rng(30);
    const club = generateClub(rng, 'c', 'C', 13);
    const numbers = club.players.map((p) => p.squadNumber);
    expect(numbers.every((n) => n !== undefined)).toBe(true);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const n of numbers) {
      expect(n!).toBeGreaterThanOrEqual(1);
      expect(n!).toBeLessThanOrEqual(99);
    }
  });

  it('assignSquadNumber는 이미 쓰인 번호를 피해서 배정한다', () => {
    const rng = new Rng(31);
    const existing: Player[] = [{ squadNumber: 7 } as Player, { squadNumber: 10 } as Player];
    const fresh = {} as Player;
    assignSquadNumber(rng, existing, fresh);
    expect(fresh.squadNumber).not.toBe(7);
    expect(fresh.squadNumber).not.toBe(10);
  });

  it('이적으로 새 구단에 합류하면 등번호가 새 구단 기준으로 겹치지 않게 유지·재배정된다', () => {
    const rng = new Rng(32);
    const clubs = [generateClub(rng, 'me', 'Me', 14), generateClub(rng, 'ot', 'Other', 14)];
    const me = clubs[0]!;
    me.finance.transferBudget = 500_000_000;
    me.finance.balance = 500_000_000;
    const target = clubs[1]!.players[0]!;
    const fee = 100_000_000;
    const before = new Set(me.players.map((p) => p.squadNumber));
    const r = buyPlayerAt(clubs, 'me', target.id, fee);
    expect(r.ok).toBe(true);
    const moved = me.players.find((p) => p.id === target.id)!;
    expect(moved.squadNumber).toBeDefined();
    expect(moved.squadNumber!).toBeGreaterThanOrEqual(1);
    expect(moved.squadNumber!).toBeLessThanOrEqual(99);
    // 새 구단 등번호 전체가 여전히 유일함
    const after = me.players.map((p) => p.squadNumber);
    expect(new Set(after).size).toBe(after.length);
    void before;
  });
});
