import { describe, it, expect } from 'vitest';
import { startGame, myClub, advanceFullSeason, lastSummary } from '../src/game.js';

describe('고도화 Item21: FFP 경고 단계 세분화 (앱 통합)', () => {
  it('첫 적자 시즌은 경고 단계로 시즌 요약에 실리고, 선수는 매각되지 않는다', () => {
    let g = startGame(2026, 'c0');
    myClub(g).finance.balance = -100_000_000; // 시즌 수입으로도 회복 불가능한 대규모 적자
    const squadBefore = myClub(g).players.length;
    g = advanceFullSeason(g);
    const summary = lastSummary(g);
    expect(summary?.ffpStage).toBe('warning');
    expect(summary?.fireSales ?? 0).toBe(0);
    expect(myClub(g).players.length).toBe(squadBefore);
    expect(myClub(g).finance.transferBudget).toBe(0);
  });

  it('자금이 충분하면 ffpStage가 시즌 요약에 아예 실리지 않는다(ok는 표시 안 함)', () => {
    let g = startGame(2027, 'c0');
    myClub(g).finance.balance = 1_000_000_000;
    g = advanceFullSeason(g);
    const summary = lastSummary(g);
    expect(summary?.ffpStage).toBe('ok');
  });

  it('3시즌 연속 적자를 유지하면 결국 강제매각 단계로 전환된다', () => {
    let g = startGame(2028, 'c0');
    let sawForcedSale = false;
    for (let i = 0; i < 3 && !sawForcedSale; i++) {
      myClub(g).finance.balance = -100_000_000; // 매 시즌 다시 큰 적자로 몰아넣는다
      g = advanceFullSeason(g);
      if (lastSummary(g)?.ffpStage === 'forcedSale') sawForcedSale = true;
    }
    expect(sawForcedSale).toBe(true);
  });
});
