import { describe, it, expect } from 'vitest';
import { startGame, myClub } from '../src/game.js';
import { buildInjuryRiskReport, injuryRiskTier } from '@soccer-tycoon/engine';

describe('신규 개선 항목 20: 의료진 부상 예측 리포트 (앱 통합)', () => {
  it('내 구단 실제 게임 상태로도 리포트가 정상 산출되고 위험도 내림차순으로 정렬된다', () => {
    const g = startGame(2026, 'c0');
    const report = buildInjuryRiskReport(myClub(g));
    expect(report.length).toBeGreaterThan(0);
    for (let i = 1; i < report.length; i++) {
      expect(report[i - 1]!.riskPerMatch).toBeGreaterThanOrEqual(report[i]!.riskPerMatch);
    }
    for (const entry of report) {
      expect(entry.tier).toBe(injuryRiskTier(entry.riskPerMatch));
    }
  });

  it('부상 중인 선수는 리포트에서 제외된다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    const injured = club.players[0]!;
    injured.injuryMatches = 3;
    const report = buildInjuryRiskReport(club);
    expect(report.some((r) => r.playerId === injured.id)).toBe(false);
  });
});
