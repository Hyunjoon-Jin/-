import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason } from '../src/game.js';

describe('고도화 Item37: 이달의 선수 (앱 통합)', () => {
  it('시즌 종료 시 블록별 이달의 선수가 시즌 요약에 실린다', () => {
    const g = advanceFullSeason(startGame(2026, 'c0'));
    const summary = g.history.at(-1)!;
    expect(summary.monthlyPlayerAwards).toBeDefined();
    expect(summary.monthlyPlayerAwards!.length).toBeGreaterThan(0);
    for (const a of summary.monthlyPlayerAwards!) {
      expect(a.avgRating).toBeGreaterThan(0);
      expect(a.apps).toBeGreaterThanOrEqual(2);
    }
  });

  it('이달의 감독과 이달의 선수는 같은 라운드 구간 수로 나뉜다', () => {
    const g = advanceFullSeason(startGame(2027, 'c0'));
    const summary = g.history.at(-1)!;
    expect(summary.monthlyPlayerAwards?.length).toBe(summary.monthlyManagerAwards?.length);
  });
});
