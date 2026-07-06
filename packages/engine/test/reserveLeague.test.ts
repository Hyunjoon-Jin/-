import { describe, it, expect } from 'vitest';
import {
  simulateReserveSeason, MIN_RESERVE_SQUAD, RESERVE_LEAGUE_CHAMPION_MORALE_BOOST,
} from '../src/reserveLeague.js';
import { aggregatePlayerStats } from '../src/stats.js';
import { generateClub, generateYouthPlayer, FORMATION_433 } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club, Player } from '../src/types.js';

function makeReserveSquad(rng: Rng, tier: number, size = MIN_RESERVE_SQUAD): Player[] {
  const positions = [...FORMATION_433, 'GK', 'DC', 'MC', 'AMC', 'ST'] as const;
  const out: Player[] = [];
  for (let i = 0; i < size; i++) {
    out.push(generateYouthPlayer(rng, positions[i % positions.length]!, tier));
  }
  return out;
}

function makeClubs(n: number, reserveSize = MIN_RESERVE_SQUAD): Club[] {
  const rng = new Rng(42);
  const clubs: Club[] = [];
  for (let i = 0; i < n; i++) {
    const club = generateClub(rng, `c${i}`, `Club ${i}`, 12);
    club.reserves = makeReserveSquad(rng, 12, reserveSize);
    clubs.push(club);
  }
  return clubs;
}

describe('신규 개선 항목 14: 리저브팀 자체 소규모 리그(가상 매치)', () => {
  it('참가 자격(MIN_RESERVE_SQUAD) 미달 구단이 2개 미만이면 빈 순위표를 반환한다', () => {
    const clubs = makeClubs(3, 5); // 5명 < MIN_RESERVE_SQUAD
    const { table } = simulateReserveSeason(clubs, 1);
    expect(table).toEqual([]);
  });

  it('참가 자격을 갖춘 구단이 2개 이상이면 전 구단이 순위표에 등장하고, 더블 라운드로빈 경기 수만큼 played가 쌓인다', () => {
    const clubs = makeClubs(4);
    const { table } = simulateReserveSeason(clubs, 1);
    expect(table).toHaveLength(4);
    for (const row of table) {
      expect(row.played).toBe(2 * (clubs.length - 1));
      expect(row.won + row.drawn + row.lost).toBe(row.played);
    }
  });

  it('참가 자격 미달 구단은 순위표에서 제외된다(혼합 상황)', () => {
    const clubs = makeClubs(3);
    clubs[0]!.reserves = makeReserveSquad(new Rng(7), 12, 5); // 자격 미달로 강등
    const { table } = simulateReserveSeason(clubs, 1);
    expect(table).toHaveLength(2);
    expect(table.some((r) => r.clubId === clubs[0]!.id)).toBe(false);
  });

  it('동일 입력·시드로 다시 돌리면 완전히 같은 순위표가 나온다(재현성)', () => {
    const a = simulateReserveSeason(makeClubs(4), 999);
    const b = simulateReserveSeason(makeClubs(4), 999);
    expect(a.table).toEqual(b.table);
  });

  it('순위표는 승점 내림차순으로 정렬된다', () => {
    const clubs = makeClubs(5);
    const { table } = simulateReserveSeason(clubs, 3);
    for (let i = 1; i < table.length; i++) {
      expect(table[i - 1]!.points).toBeGreaterThanOrEqual(table[i]!.points);
    }
  });

  it('우승 구단(1위) 리저브 전원에게 사기 보너스가 부여된다', () => {
    const clubs = makeClubs(4);
    const before = clubs.map((c) => c.reserves!.map((p) => p.morale));
    const { table } = simulateReserveSeason(clubs, 1);
    const championIdx = clubs.findIndex((c) => c.id === table[0]!.clubId);
    clubs[championIdx]!.reserves!.forEach((p, i) => {
      expect(p.morale).toBeCloseTo(Math.min(1, before[championIdx]![i]! + RESERVE_LEAGUE_CHAMPION_MORALE_BOOST), 5);
    });
  });

  it('우승하지 못한 구단의 리저브 선수는 사기가 그대로다', () => {
    const clubs = makeClubs(4);
    const before = clubs.map((c) => c.reserves!.map((p) => p.morale));
    const { table } = simulateReserveSeason(clubs, 1);
    clubs.forEach((c, idx) => {
      if (c.id === table[0]!.clubId) return;
      c.reserves!.forEach((p, i) => expect(p.morale).toBeCloseTo(before[idx]![i]!, 5));
    });
  });
});

describe('고도화 Item11: 리저브 리그 개인기록 노출', () => {
  it('참가 자격 미달이면 matches도 빈 배열이다', () => {
    const clubs = makeClubs(3, 5);
    const { matches } = simulateReserveSeason(clubs, 1);
    expect(matches).toEqual([]);
  });

  it('경기 결과의 homeClubId/awayClubId는 내부 reserve: 접두사 없이 실제 구단id 그대로다', () => {
    const clubs = makeClubs(4);
    const { matches } = simulateReserveSeason(clubs, 1);
    expect(matches.length).toBeGreaterThan(0);
    const ids = new Set(clubs.map((c) => c.id));
    for (const m of matches) {
      expect(m.homeClubId.startsWith('reserve:')).toBe(false);
      expect(m.awayClubId.startsWith('reserve:')).toBe(false);
      expect(ids.has(m.homeClubId)).toBe(true);
      expect(ids.has(m.awayClubId)).toBe(true);
    }
  });

  it('경기 수는 더블 라운드로빈 총 경기 수와 일치한다', () => {
    const clubs = makeClubs(4);
    const { matches } = simulateReserveSeason(clubs, 1);
    expect(matches).toHaveLength(clubs.length * (clubs.length - 1)); // 더블 라운드로빈: n*(n-1)
  });

  it('개인 선수 기록을 aggregatePlayerStats로 집계할 수 있다(리저브 선수만 등장)', () => {
    const clubs = makeClubs(4);
    const { matches } = simulateReserveSeason(clubs, 1);
    const stats = aggregatePlayerStats(matches);
    expect(stats.length).toBeGreaterThan(0);
    const reserveIds = new Set(clubs.flatMap((c) => c.reserves!.map((p) => p.id)));
    for (const s of stats) expect(reserveIds.has(s.playerId)).toBe(true);
  });
});
