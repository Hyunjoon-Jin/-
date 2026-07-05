import { describe, it, expect } from 'vitest';
import { startGame, myAgentRelations, recordNegotiationBreakdown } from '../src/game.js';

describe('신규 개선 항목 6: 에이전트 관계 지수 (앱 통합)', () => {
  it('새 게임 시작 시 관계 지수는 중립(50)이다', () => {
    const g = startGame(2026, 'c0');
    const r = myAgentRelations(g);
    expect(r.value).toBe(50);
    expect(r.tier).toBe('neutral');
  });

  it('협상 결렬을 기록하면 관계 지수가 떨어진다', () => {
    const g = startGame(2027, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const target = otherClub.players[0]!;

    const before = myAgentRelations(g).value;
    const g2 = recordNegotiationBreakdown(g, target.id);
    expect(myAgentRelations(g2).value).toBeLessThan(before);
  });
});
