import { describe, it, expect } from 'vitest';
import {
  startGame, startSeason, playRestOfSeason, finishSeason, myAgentRelations, recordNegotiationBreakdown,
} from '../src/game.js';

describe('신규 개선 항목 6 + 고도화 항목1: 에이전트 관계 지수 (앱 통합)', () => {
  it('새 게임 시작 시 어떤 상대 구단과도 관계 지수는 중립(50)이다', () => {
    const g = startGame(2026, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const r = myAgentRelations(g, otherClub.id);
    expect(r.value).toBe(50);
    expect(r.tier).toBe('neutral');
  });

  it('협상 결렬을 기록하면 그 매도 구단과의 관계 지수만 떨어진다', () => {
    const g = startGame(2027, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const thirdClub = g.clubs.find((c) => c.id !== g.myClubId && c.id !== otherClub.id)!;
    const target = otherClub.players[0]!;

    const before = myAgentRelations(g, otherClub.id).value;
    const g2 = recordNegotiationBreakdown(g, target.id);
    expect(myAgentRelations(g2, otherClub.id).value).toBeLessThan(before);
    // 관계가 없던 다른 구단은 여전히 중립 그대로(고도화 항목1 핵심).
    expect(myAgentRelations(g2, thirdClub.id).value).toBe(50);
  });

  it('시즌을 진행하면 나쁜 관계가 서서히 중립 쪽으로 회복된다', () => {
    const g0 = startGame(2028, 'c0');
    const otherClub = g0.clubs.find((c) => c.id !== g0.myClubId)!;
    const target = otherClub.players[0]!;
    const broken = recordNegotiationBreakdown(g0, target.id);
    const worstValue = myAgentRelations(broken, otherClub.id).value;
    expect(worstValue).toBeLessThan(50);

    const afterSeason = finishSeason(playRestOfSeason(startSeason(broken)));
    const recoveredValue = myAgentRelations(afterSeason, otherClub.id).value;
    expect(recoveredValue).toBeGreaterThan(worstValue);
    expect(recoveredValue).toBeLessThanOrEqual(50);
  });
});
