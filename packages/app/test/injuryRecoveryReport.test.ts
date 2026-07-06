import { describe, it, expect } from 'vitest';
import { startGame, startSeason, playRound, myClub } from '../src/game.js';
import { buildInjuryRecoveryReport } from '@soccer-tycoon/engine';

describe('신규 개선 항목 28: 부상 회복 진행 현황 (앱 통합)', () => {
  it('시즌 진행 중 부상이 발생하면 회복 리포트에서 확인할 수 있다', () => {
    let found = false;
    for (let seed = 2026; seed <= 2026 + 40 && !found; seed++) {
      let g = startSeason(startGame(seed, 'c0'));
      // 초반 몇 라운드만 진행 — 이번 라운드에 발생한 부상은 아직 회복 중일 확률이 높다.
      for (let i = 0; i < 3; i++) g = playRound(g);
      const club = myClub(g);
      const report = buildInjuryRecoveryReport(club);
      if (report.length > 0) {
        found = true;
        for (const entry of report) {
          expect(entry.totalMatches).toBeGreaterThan(0);
          expect(entry.remainingMatches).toBeGreaterThanOrEqual(0);
          expect(entry.progress).toBeGreaterThanOrEqual(0);
          expect(entry.progress).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(found).toBe(true);
  });

  it('부상이 없는 신규 게임은 회복 리포트가 비어있다', () => {
    const g = startGame(2026, 'c0');
    expect(buildInjuryRecoveryReport(myClub(g))).toEqual([]);
  });
});
