import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, myClub } from '../src/game.js';

describe('시즌 요약: 이사회 신뢰 등급 상승 투자 보너스 (C-new1)', () => {
  it('여러 시즌 진행 중 신뢰 등급이 오르면 boardTierBonus가 실리고 자금이 늘어난다', () => {
    let g = startGame(2026, 'c0');
    let sawBonus = false;
    for (let i = 0; i < 20 && !sawBonus; i++) {
      const before = myClub(g).finance.balance;
      g = advanceFullSeason(g);
      const last = g.history[g.history.length - 1]!;
      if (last.boardTierBonus) {
        sawBonus = true;
        expect(last.boardTierBonus.amount).toBeGreaterThan(0);
        expect(myClub(g).finance.balance).toBeGreaterThanOrEqual(before + last.boardTierBonus.amount);
      }
    }
    expect(sawBonus).toBe(true);
  });

  it('신뢰 등급이 그대로거나 내려간 시즌은 boardTierBonus가 없다', () => {
    let g = startGame(2027, 'c0');
    let sawUndefined = false;
    for (let i = 0; i < 20; i++) {
      g = advanceFullSeason(g);
      if (g.history[g.history.length - 1]!.boardTierBonus === undefined) sawUndefined = true;
    }
    expect(sawUndefined).toBe(true);
  });
});
