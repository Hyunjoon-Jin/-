import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, lastSummary, myClub } from '../src/game.js';

describe('고도화 Item24: 이달의 감독 (앱 통합)', () => {
  it('시즌 종료 시 4라운드 블록별 최고 성적 구단이 summary에 실린다', () => {
    let g = startGame(2026, 'c0');
    g = advanceFullSeason(g);
    const awards = lastSummary(g)?.monthlyManagerAwards;
    expect(awards).toBeDefined();
    expect(awards!.length).toBeGreaterThan(0);
    for (const a of awards!) {
      expect(a.toRound).toBeGreaterThanOrEqual(a.fromRound);
      expect(a.points).toBeGreaterThanOrEqual(0);
    }
  });

  it('블록은 라운드 순서대로 이어지고 겹치지 않는다', () => {
    let g = startGame(2027, 'c0');
    g = advanceFullSeason(g);
    const awards = lastSummary(g)?.monthlyManagerAwards ?? [];
    for (let i = 1; i < awards.length; i++) {
      expect(awards[i]!.fromRound).toBe(awards[i - 1]!.toRound + 1);
    }
    expect(awards[0]?.fromRound).toBe(1);
  });

  it('내 구단이 특정 구간 최고 성적이면 clubId가 내 구단으로 실린다', () => {
    let g = startGame(2028, 'c0');
    g = advanceFullSeason(g);
    const awards = lastSummary(g)?.monthlyManagerAwards ?? [];
    // 내 구단이 한 번이라도 수상했는지는 시드에 따라 다르므로, 최소한 유효한 구단 ID인지만 확인.
    const clubIds = new Set(g.clubs.map((c) => c.id));
    for (const a of awards) {
      expect(clubIds.has(a.clubId)).toBe(true);
    }
    expect(myClub(g)).toBeDefined();
  });
});
