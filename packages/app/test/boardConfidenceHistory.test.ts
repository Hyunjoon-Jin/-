import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason } from '../src/game.js';

describe('고도화 Item39: 이사회 신뢰도 추이 (시즌별 스파크라인)', () => {
  it('시즌 종료 시 그 시점 이사회 신뢰도가 시즌 요약에 캡처된다', () => {
    let g = startGame(2026, 'c0');
    g = advanceFullSeason(g);
    const summary = g.history.at(-1)!;
    expect(summary.boardConfidenceAfter).toBeDefined();
    expect(summary.boardConfidenceAfter).toBe(g.boardConfidence);
  });

  it('여러 시즌 진행 시 각 시즌 요약이 그 시점의 서로 다른(또는 같은) 신뢰도 값을 독립적으로 기록한다', () => {
    let g = startGame(2027, 'c0');
    for (let i = 0; i < 3; i++) g = advanceFullSeason(g);
    const values = g.history.map((s) => s.boardConfidenceAfter);
    expect(values.every((v) => v !== undefined)).toBe(true);
    // 마지막 시즌 기록이 현재 상태의 신뢰도와 일치해야 한다.
    expect(values.at(-1)).toBe(g.boardConfidence);
  });
});
