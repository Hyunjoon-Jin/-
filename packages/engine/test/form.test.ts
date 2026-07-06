import { describe, it, expect } from 'vitest';
import { recentForm } from '../src/form.js';
import type { MatchResult } from '../src/types.js';

function m(home: string, away: string, hg: number, ag: number): MatchResult {
  return {
    homeClubId: home, awayClubId: away, homeClubName: home, awayClubName: away,
    score: [hg, ag], possession: [50, 50], shots: [0, 0],
    events: [], cards: [], injuries: [], playerStats: { home: [], away: [] }, seed: 1,
  };
}

describe('form: 최근 폼 집계', () => {
  const results: MatchResult[] = [
    m('A', 'B', 2, 0), // A 승
    m('C', 'A', 1, 1), // A 무 (원정)
    m('A', 'D', 0, 3), // A 패
    m('E', 'A', 0, 2), // A 승 (원정)
    m('B', 'C', 1, 0), // A 미출전
  ];

  it('홈/원정 관점을 정확히 반영한다', () => {
    const f = recentForm(results, 'A', 5);
    expect(f.results).toEqual(['W', 'D', 'L', 'W']);
    expect(f.points).toBe(3 + 1 + 0 + 3);
    expect(f.gf).toBe(2 + 1 + 0 + 2);
    expect(f.ga).toBe(0 + 1 + 3 + 0);
  });

  it('최근 n경기만 남긴다(오래된→최신)', () => {
    const f = recentForm(results, 'A', 2);
    // A의 경기: W,D,L,W → 최근 2경기 = L,W
    expect(f.results).toEqual(['L', 'W']);
    expect(f.points).toBe(3);
  });

  it('경기가 없으면 빈 폼', () => {
    const f = recentForm(results, 'Z', 5);
    expect(f.results).toEqual([]);
    expect(f.points).toBe(0);
    expect(f.gf).toBe(0);
    expect(f.ga).toBe(0);
  });

  it('venue를 지정하면 홈/원정 중 해당 구장 경기만 집계한다(고도화 항목23)', () => {
    // A의 홈 경기: A 2-0 B(승), A 0-3 D(패). A의 원정 경기: C 1-1 A(무), E 0-2 A(승).
    const home = recentForm(results, 'A', 5, 'home');
    expect(home.results).toEqual(['W', 'L']);
    expect(home.points).toBe(3);

    const away = recentForm(results, 'A', 5, 'away');
    expect(away.results).toEqual(['D', 'W']);
    expect(away.points).toBe(1 + 3);
  });

  it('venue 미지정 시 기존과 동일하게 홈/원정 모두 포함한다', () => {
    const all = recentForm(results, 'A', 5);
    const home = recentForm(results, 'A', 5, 'home');
    const away = recentForm(results, 'A', 5, 'away');
    expect(all.points).toBe(home.points + away.points);
  });
});
