import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason } from '../src/game.js';
import { TOURNAMENT_INTERVAL_SEASONS } from '@soccer-tycoon/engine';

describe('고도화 Item31: 국제대회 내 구단 소속 국가대표 성적 하이라이트 (앱 통합)', () => {
  it('국제대회가 열린 시즌엔 내 구단에 차출된 선수가 있으면 하이라이트가 실린다', () => {
    let g = startGame(2026, 'c0');
    let sawTournament = false;
    for (let i = 0; i < TOURNAMENT_INTERVAL_SEASONS * 3 && !sawTournament; i++) {
      g = advanceFullSeason(g);
      const last = g.history[g.history.length - 1]!;
      if (last.internationalTournamentChampion !== undefined) {
        sawTournament = true;
        if (last.internationalTournamentHighlight) {
          expect(last.internationalTournamentHighlight.myNations.length).toBeGreaterThan(0);
          expect(typeof last.internationalTournamentHighlight.won).toBe('boolean');
        }
      } else {
        expect(last.internationalTournamentHighlight).toBeUndefined();
      }
    }
    expect(sawTournament).toBe(true);
  });
});
