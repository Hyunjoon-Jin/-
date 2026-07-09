import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason } from '../src/game.js';

describe('고도화 Item45: 빅찬스 생성/실축 지표 (앱 통합)', () => {
  it('시즌 종료 시 득점 순위(topScorers)에 빅찬스 생성/실축이 집계된다', () => {
    let g = startGame(2026, 'c0');
    let found = false;
    for (let i = 0; i < 5 && !found; i++) {
      g = advanceFullSeason(g);
      const summary = g.history.at(-1)!;
      if (summary.topScorers.some((s) => s.bigChancesCreated > 0)) found = true;
    }
    expect(found).toBe(true);
  });

  it('빅찬스 실축 수는 항상 생성 수 이하다', () => {
    const g = advanceFullSeason(startGame(2027, 'c0'));
    const summary = g.history.at(-1)!;
    for (const s of summary.topScorers) {
      expect(s.bigChancesMissed).toBeLessThanOrEqual(s.bigChancesCreated);
    }
  });
});
