import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, lastSummary } from '../src/game.js';
import { computeClubRecords } from '../src/records.js';

describe('고도화 Item27: 최다 득점차 승리 기록 (앱 통합)', () => {
  it('시즌 종료 시 승리한 경기가 있으면 최다 득점차 승리가 summary에 실린다', () => {
    let g = startGame(2026, 'c0');
    g = advanceFullSeason(g);
    const win = lastSummary(g)?.biggestWin;
    if (win) {
      expect(win.margin).toBeGreaterThan(0);
      expect(win.myGoals).toBeGreaterThan(win.oppGoals);
      expect(win.margin).toBe(win.myGoals - win.oppGoals);
    }
  });

  it('여러 시즌 진행 후 역대 기록집에 최다 득점차 승리가 누적된다', () => {
    let g = startGame(2027, 'c0');
    for (let i = 0; i < 3; i++) g = advanceFullSeason(g);
    const records = computeClubRecords(g);
    const anyWin = g.history.some((s) => s.biggestWin !== undefined);
    if (anyWin) {
      expect(records.bestWinMargin).toBeDefined();
      expect(records.bestWinMargin!.detail).toMatch(/\(\+\d+\)$/);
    }
  });
});
