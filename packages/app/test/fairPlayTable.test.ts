import { describe, it, expect } from 'vitest';
import {
  startGame, advanceFullSeason, myClub, lastSummary,
} from '../src/game.js';
import { clubsInDivision } from '@soccer-tycoon/engine';

describe('고도화 Item22: 시즌 페어플레이(징계) 순위표 (앱 통합)', () => {
  it('시즌 종료 시 내 부 전 구단이 카드 수 오름차순으로 순위표에 실린다', () => {
    let g = startGame(2026, 'c0');
    g = advanceFullSeason(g);
    const summary = lastSummary(g);
    const table = summary?.fairPlayTable;
    expect(table).toBeDefined();
    expect(table!.length).toBe(clubsInDivision(g.clubs, myClub(g).division).length);
    expect(table!.some((r) => r.clubId === g.myClubId)).toBe(true);
    for (let i = 1; i < table!.length; i++) {
      expect(table![i - 1]!.totalCards).toBeLessThanOrEqual(table![i]!.totalCards);
    }
  });

  it('각 행의 옐로+레드 합은 totalCards와 일치한다', () => {
    let g = startGame(2027, 'c0');
    g = advanceFullSeason(g);
    const table = lastSummary(g)!.fairPlayTable!;
    for (const row of table) {
      expect(row.yellowCards + row.redCards).toBe(row.totalCards);
    }
  });
});
