import { describe, it, expect } from 'vitest';
import { startGame, startSeason, playRestOfSeason, finishSeason, myClub } from '../src/game.js';
import { CUP_UPSET_REP_GAP } from '@soccer-tycoon/engine';

describe('신규 개선 항목 29: 컵대회 이변(자이언트 킬링) 추적 (앱 통합)', () => {
  it('내 구단이 관여한 이변이 있으면 시즌 요약에 남고, 없으면 undefined다', () => {
    let anyRun = false;
    let sawSummaryField = false;
    for (let seed = 2026; seed <= 2026 + 60; seed++) {
      const g0 = startSeason(startGame(seed, 'c0'));
      const g1 = finishSeason(playRestOfSeason(g0));
      const last = g1.history.at(-1)!;
      anyRun = true;
      if (last.cupUpsets !== undefined) {
        sawSummaryField = true;
        expect(last.cupUpsets.length).toBeGreaterThan(0);
        for (const u of last.cupUpsets) {
          expect(u.winnerId === g1.myClubId || u.loserId === g1.myClubId).toBe(true);
          expect(u.repGap).toBeGreaterThanOrEqual(CUP_UPSET_REP_GAP);
        }
      }
    }
    expect(anyRun).toBe(true);
    // 여러 시드 중 최소 한 번쯤은 이변이 등장하는 것이 자연스럽다(확률적 통계 확인).
    expect(sawSummaryField).toBe(true);
  });

  it('컵대회가 없으면(중도 취소 등) cupUpsets는 항상 undefined다', () => {
    const g0 = startSeason(startGame(2026, 'c0'));
    const state = { ...g0, cup: null };
    const g1 = finishSeason(playRestOfSeason(state));
    expect(g1.history.at(-1)!.cupUpsets).toBeUndefined();
    expect(myClub(g1)).toBeDefined();
  });
});
