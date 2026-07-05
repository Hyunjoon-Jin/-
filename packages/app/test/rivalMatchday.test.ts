import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, myClub } from '../src/game.js';

describe('신규 개선 항목 23: 라이벌전 매치데이 수익 프리미엄 (앱 통합)', () => {
  it('시즌 1에는 라이벌이 항상 같은 부에 있어(더블 라운드로빈) 홈 라이벌전이 열리고, 매치데이 수익에 프리미엄이 반영된다', () => {
    const g0 = startGame(2026, 'c0');
    const rivalId = g0.rivalClubId;
    expect(g0.clubs.find((c) => c.id === rivalId)!.division).toBe(myClub(g0).division);

    const g1 = advanceFullSeason(g0);
    const summary = g1.history.at(-1)!;
    const myReport = summary.finance.get(g0.myClubId)!;
    expect(myReport.rivalBonus).toBeGreaterThan(0);
    expect(myReport.income.matchday).toBeGreaterThan(0);
  });
});
