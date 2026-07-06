import { describe, it, expect } from 'vitest';
import { startGame, startSeason, playRound, matchPreview } from '../src/game.js';
import { recentForm } from '@soccer-tycoon/engine';

describe('고도화 Item23: 홈/원정 폼 분리 (앱 통합)', () => {
  it('경기 프리뷰의 venueForm은 실제 구장 조건(홈팀→홈, 원정팀→원정)만 반영한다', () => {
    let g = startSeason(startGame(2026, 'c0'));
    for (let i = 0; i < 4 && g.live && g.live.cursor < g.live.fixtures.length; i++) {
      g = playRound(g);
    }
    const preview = matchPreview(g);
    expect(preview).not.toBeNull();
    if (!preview) return;

    const expectedHomeVenueForm = recentForm(g.live!.results, preview.home.clubId, 5, 'home');
    const expectedAwayVenueForm = recentForm(g.live!.results, preview.away.clubId, 5, 'away');
    expect(preview.home.venueForm).toEqual(expectedHomeVenueForm);
    expect(preview.away.venueForm).toEqual(expectedAwayVenueForm);
  });

  it('venueForm은 전체 폼(form)의 부분집합이라 경기 수가 같거나 적다', () => {
    let g = startSeason(startGame(2027, 'c0'));
    for (let i = 0; i < 5 && g.live && g.live.cursor < g.live.fixtures.length; i++) {
      g = playRound(g);
    }
    const preview = matchPreview(g);
    expect(preview).not.toBeNull();
    if (!preview) return;
    expect(preview.home.venueForm.results.length).toBeLessThanOrEqual(preview.home.form.results.length);
    expect(preview.away.venueForm.results.length).toBeLessThanOrEqual(preview.away.form.results.length);
  });
});
