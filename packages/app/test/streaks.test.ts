import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, lastSummary } from '../src/game.js';
import { computeClubRecords } from '../src/records.js';

describe('고도화 Item25: 연승/무패 기록 추적 (앱 통합)', () => {
  it('시즌 종료 시 내 구단의 최장 연승·무패가 summary에 실린다', () => {
    let g = startGame(2026, 'c0');
    g = advanceFullSeason(g);
    const streaks = lastSummary(g)?.streaks;
    expect(streaks).toBeDefined();
    expect(streaks!.winStreak).toBeGreaterThanOrEqual(0);
    expect(streaks!.unbeatenStreak).toBeGreaterThanOrEqual(streaks!.winStreak);
  });

  it('여러 시즌 진행 후 역대 기록집에 최장 연승·무패가 누적된다', () => {
    let g = startGame(2027, 'c0');
    for (let i = 0; i < 3; i++) g = advanceFullSeason(g);
    const records = computeClubRecords(g);
    const anyWinStreak = g.history.some((s) => (s.streaks?.winStreak ?? 0) > 0);
    if (anyWinStreak) {
      expect(records.bestWinStreak).toBeDefined();
      expect(records.bestWinStreak!.detail).toMatch(/연승$/);
    }
    const anyUnbeaten = g.history.some((s) => (s.streaks?.unbeatenStreak ?? 0) > 0);
    if (anyUnbeaten) {
      expect(records.bestUnbeatenStreak).toBeDefined();
    }
  });
});
