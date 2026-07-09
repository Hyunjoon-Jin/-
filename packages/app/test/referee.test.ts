import { describe, it, expect } from 'vitest';
import { startGame, startSeason, watchSetup, matchPreview } from '../src/game.js';
import { matchRefereeStrictness, simulateMatch } from '@soccer-tycoon/engine';

describe('고도화 항목46: 심판 엄격도 (앱 통합)', () => {
  it('경기 프리뷰의 심판 엄격도는 실제 시뮬레이션 결과와 정확히 일치한다', () => {
    const g = startSeason(startGame(2026, 'c0'));
    const ws = watchSetup(g)!;
    const preview = matchPreview(g)!;
    const result = simulateMatch(ws.setup);
    expect(preview.refereeStrictness).toBe(result.refereeStrictness);
    expect(preview.refereeStrictness).toBe(
      matchRefereeStrictness(ws.setup.seed, ws.setup.home.club.id, ws.setup.away.club.id),
    );
  });

  it('같은 시드로 새로 시작한 게임은 프리뷰 심판 엄격도도 동일하다(재현성)', () => {
    const g1 = startSeason(startGame(2027, 'c0'));
    const g2 = startSeason(startGame(2027, 'c0'));
    expect(matchPreview(g1)!.refereeStrictness).toBe(matchPreview(g2)!.refereeStrictness);
  });
});
