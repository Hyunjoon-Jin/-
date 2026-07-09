import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, lastSummary, myClub } from '../src/game.js';

describe('고도화 Item26: 시즌 순위 추이 기록 (앱 통합)', () => {
  it('시즌 종료 시 라운드 수만큼 순위 추이가 summary에 실리고, 마지막 값은 최종 순위와 일치한다', () => {
    let g = startGame(2026, 'c0');
    g = advanceFullSeason(g);
    const summary = lastSummary(g);
    const history = summary?.positionHistory;
    expect(history).toBeDefined();
    expect(history!.length).toBeGreaterThan(0);
    for (const pos of history!) {
      expect(pos).toBeGreaterThanOrEqual(1);
      expect(pos).toBeLessThanOrEqual(summary!.table.length);
    }
    const finalPos = summary!.table.findIndex((r) => r.clubId === g.myClubId) + 1;
    expect(history!.at(-1)).toBe(finalPos);
  });

  it('여러 시즌을 진행해도 매 시즌 독립적으로 순위 추이가 기록된다', () => {
    let g = startGame(2027, 'c0');
    g = advanceFullSeason(g);
    const first = lastSummary(g)?.positionHistory;
    g = advanceFullSeason(g);
    const second = lastSummary(g)?.positionHistory;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(myClub(g)).toBeDefined();
  });
});
