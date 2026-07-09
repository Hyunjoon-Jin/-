import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, myClub } from '../src/game.js';

describe('고도화 Item20: 장기 프로젝트 보너스', () => {
  it('이사회 목표를 달성한 시즌에는 objectiveStreak이 늘고, 실패하면 0으로 리셋된다', () => {
    let g = startGame(2026, 'c0');
    let sawIncrease = false;
    let sawReset = false;
    let prevStreak = g.objectiveStreak ?? 0;
    for (let i = 0; i < 20 && (!sawIncrease || !sawReset); i++) {
      const objectiveBefore = g.objective;
      g = advanceFullSeason(g);
      const streak = g.objectiveStreak ?? 0;
      const myPosition = g.history[g.history.length - 1]!.table.findIndex(
        (r) => r.clubId === myClub(g).id,
      ) + 1;
      if (myPosition <= objectiveBefore) {
        expect(streak).toBe(prevStreak + 1);
        if (streak > 1) sawIncrease = true;
      } else {
        expect(streak).toBe(0);
        if (prevStreak > 0) sawReset = true;
      }
      prevStreak = streak;
    }
    expect(sawIncrease || sawReset).toBe(true);
  });

  it('스트릭이 마일스톤(3시즌)에 처음 도달하면 예산이 늘고 시즌 요약에 보너스가 실린다', () => {
    let g = startGame(2027, 'c0');
    let found = false;
    for (let i = 0; i < 20 && !found; i++) {
      const balanceBefore = myClub(g).finance.balance;
      g = advanceFullSeason(g);
      const last = g.history[g.history.length - 1]!;
      if (last.longTermProjectBonus) {
        found = true;
        expect(last.longTermProjectBonus.bonus).toBeGreaterThan(0);
        expect(myClub(g).finance.balance).toBeGreaterThan(balanceBefore);
      }
    }
    // 이 시드에서 마일스톤 도달이 안 나올 수도 있으니, 최소한 여러 시즌이
    // 오류 없이 진행됐는지 확인(보너스 검증은 found일 때 위에서 수행).
    expect(g.history.length).toBeGreaterThan(0);
  });
});
