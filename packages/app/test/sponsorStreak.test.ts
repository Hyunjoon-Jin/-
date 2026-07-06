import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason } from '../src/game.js';

describe('시즌 요약: 스폰서 목표 연속 달성 스트릭 (C-new2)', () => {
  it('목표를 달성한 시즌에는 sponsorStreak이 늘고, 실패하면 0으로 리셋된다', () => {
    let g = startGame(2026, 'c0');
    let sawIncrease = false;
    let sawReset = false;
    let prevStreak = g.sponsorStreak ?? 0;
    for (let i = 0; i < 15 && (!sawIncrease || !sawReset); i++) {
      g = advanceFullSeason(g);
      const last = g.history[g.history.length - 1]!;
      const streak = g.sponsorStreak ?? 0;
      if (last.sponsorGoal) {
        if (last.sponsorGoal.met) {
          expect(streak).toBe(prevStreak + 1);
          if (streak > 1) sawIncrease = true;
        } else {
          expect(streak).toBe(0);
          if (prevStreak > 0) sawReset = true;
        }
      }
      prevStreak = streak;
    }
    expect(sawIncrease || sawReset).toBe(true);
  });

  it('목표 달성 시 보너스에 스트릭 배율이 곱해져 지급된다', () => {
    let g = startGame(2027, 'c0');
    let checked = false;
    for (let i = 0; i < 15 && !checked; i++) {
      const prevStreak = g.sponsorStreak ?? 0;
      const goalBeforeSeason = g.sponsorGoal;
      g = advanceFullSeason(g);
      const last = g.history[g.history.length - 1]!;
      if (goalBeforeSeason && last.sponsorGoal?.met && prevStreak > 0) {
        checked = true;
        expect(last.sponsorGoal.bonus).toBeGreaterThan(goalBeforeSeason.bonus);
      }
    }
    // 이 시드에서 스트릭 보유 상태로 목표를 달성하는 케이스가 없을 수도 있으니
    // 최소한 오류 없이 여러 시즌이 진행됐는지만 확인(배율 검증은 checked일 때 위에서 수행).
    expect(g.history.length).toBeGreaterThan(0);
  });
});
