import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason } from '../src/game.js';

// 이사회 성향(회장 성향 유형, Phase 8 C03)에 따라 요구 스킵 확률이 구단마다 ±0.15
// 가감되므로, 시즌 수가 너무 적으면(예: 6시즌) 보수적 성향의 구단이 우연히 한 번도
// 요구를 받지 못할 수 있다 — 15시즌으로 늘려 확률적 견고성을 확보한다.
describe('시즌 요약: 이사회 특별 요구 히스토리', () => {
  it('요구가 부여된 시즌은 history에 label·met이 그대로 남아 누적된다', () => {
    let g = startGame(2026, 'c0');
    let sawSome = false;
    for (let i = 0; i < 15; i++) {
      g = advanceFullSeason(g);
    }
    for (const s of g.history) {
      if (!s.demand) continue;
      sawSome = true;
      expect(typeof s.demand.label).toBe('string');
      expect(s.demand.label.length).toBeGreaterThan(0);
      expect(typeof s.demand.met).toBe('boolean');
    }
    expect(sawSome).toBe(true);
  });

  it('요구 없이 지나간 시즌은 demand가 undefined로 남는다', () => {
    let g = startGame(2026, 'c0');
    let sawUndefined = false;
    for (let i = 0; i < 15; i++) {
      g = advanceFullSeason(g);
      if (g.history[g.history.length - 1]!.demand === undefined) sawUndefined = true;
    }
    expect(sawUndefined).toBe(true);
  });
});
