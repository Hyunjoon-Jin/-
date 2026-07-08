import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason } from '../src/game.js';

describe('고도화 Item38: 시즌 MOTM 집계 (앱 통합)', () => {
  it('시즌 종료 시 최다 MOTM 어워드가 시즌 요약에 실린다', () => {
    const g = advanceFullSeason(startGame(2026, 'c0'));
    const summary = g.history.at(-1)!;
    expect(summary.awards.mostMotm).toBeDefined();
    expect(summary.awards.mostMotm!.count).toBeGreaterThan(0);
  });
});
