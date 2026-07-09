import { describe, it, expect } from 'vitest';
import { startGame, myClub } from '../src/game.js';
import { buildInjuryRiskReport } from '@soccer-tycoon/engine';

describe('고도화 Item28: 피로 연동 부상 위험 (앱 통합)', () => {
  it('실제 club 데이터로 만든 부상 위험 리포트(Staff.tsx가 쓰는 것과 동일)가 컨디션 저하를 반영한다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const p = club.players[0]!;

    p.condition = 1;
    const freshReport = buildInjuryRiskReport(club).find((r) => r.playerId === p.id)!;

    p.condition = 0.35;
    const tiredReport = buildInjuryRiskReport(club).find((r) => r.playerId === p.id)!;

    expect(tiredReport.riskPerMatch).toBeGreaterThan(freshReport.riskPerMatch);
  });
});
