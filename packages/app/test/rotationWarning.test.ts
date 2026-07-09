import { describe, it, expect } from 'vitest';
import { startGame, startSeason, playRound, myClub } from '../src/game.js';
import { buildRotationWarningReport, ROTATION_WARNING_THRESHOLD } from '@soccer-tycoon/engine';

describe('고도화 Item30: 로테이션 필요(과사용) 경고 (앱 통합)', () => {
  it('여러 라운드를 계속 선발로 뛴 선수는 연속 출전이 쌓이고, 임계값을 넘으면 경고 리포트에 오른다', () => {
    let g = startSeason(startGame(2026, 'c0'));
    for (let i = 0; i < ROTATION_WARNING_THRESHOLD + 2 && g.live && g.live.cursor < g.live.fixtures.length; i++) {
      g = playRound(g);
    }
    const club = myClub(g);
    const report = buildRotationWarningReport(club);
    for (const entry of report) {
      expect(entry.consecutiveStarts).toBeGreaterThan(ROTATION_WARNING_THRESHOLD);
      const p = club.players.find((pl) => pl.id === entry.playerId)!;
      expect(p.consecutiveStarts).toBe(entry.consecutiveStarts);
    }
  });
});
