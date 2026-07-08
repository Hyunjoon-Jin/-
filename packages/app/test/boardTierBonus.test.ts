import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, myClub } from '../src/game.js';

describe('시즌 요약: 이사회 신뢰 등급 상승 투자 보너스 (C-new1)', () => {
  it('여러 시즌 진행 중 신뢰 등급이 오르면 boardTierBonus가 실리고 자금이 늘어난다', () => {
    // 시드 2026은 고도화 항목30(로테이션 필요 경고 — 과사용 시 추가 피로)이 반영된
    // 이후 시즌 궤적이 바뀌어 20시즌 내내 신뢰 등급이 오르지 않는 경로로 바뀌었다 —
    // 검증 목적에 맞는 시드로 교체.
    let g = startGame(2028, 'c0');
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
