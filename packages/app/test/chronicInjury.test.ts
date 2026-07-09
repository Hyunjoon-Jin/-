import { describe, it, expect } from 'vitest';
import { startGame, myClub } from '../src/game.js';
import { buildInjuryRiskReport, CHRONIC_INJURY_FREE_COUNT } from '@soccer-tycoon/engine';

describe('고도화 Item29: 만성 부상 이력 반영 (앱 통합)', () => {
  it('실제 club 데이터로 만든 부상 위험 리포트가 통산 부상 이력을 반영한다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const p = club.players[0]!;

    p.careerInjuryCount = 0;
    const cleanReport = buildInjuryRiskReport(club).find((r) => r.playerId === p.id)!;
    expect(cleanReport.isChronicallyInjured).toBe(false);

    p.careerInjuryCount = CHRONIC_INJURY_FREE_COUNT + 5;
    const chronicReport = buildInjuryRiskReport(club).find((r) => r.playerId === p.id)!;
    expect(chronicReport.isChronicallyInjured).toBe(true);
    expect(chronicReport.riskPerMatch).toBeGreaterThan(cleanReport.riskPerMatch);
  });
});
