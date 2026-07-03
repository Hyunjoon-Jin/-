import { describe, it, expect } from 'vitest';
import { startGame, startSeason, watchSetup, commitWatchedRound } from '../src/game.js';
import { simulateMatch } from '@soccer-tycoon/engine';

describe('commitWatchedRound: 관전 결과 검증', () => {
  it('실제 이번 라운드 픽스처와 무관한(홈/원정 구단이 다른) 결과를 넘기면 에러를 던진다', () => {
    const g = startSeason(startGame(2026, 'c0'));
    const ws = watchSetup(g)!;
    const bogus = simulateMatch({
      home: ws.setup.away, away: ws.setup.home, // 홈/원정을 뒤바꿔 픽스처와 불일치시킴
      seed: ws.setup.seed,
    });
    expect(() => commitWatchedRound(g, bogus)).toThrow();
  });

  it('실제 픽스처와 일치하는 결과는 정상적으로 커밋된다', () => {
    const g = startSeason(startGame(2026, 'c0'));
    const ws = watchSetup(g)!;
    const result = simulateMatch(ws.setup);
    const next = commitWatchedRound(g, result);
    expect(next.live!.cursor).toBeGreaterThan(g.live!.cursor);
  });
});
