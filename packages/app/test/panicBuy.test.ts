import { describe, it, expect } from 'vitest';
import { startGame, myClub, panicBuyAction } from '../src/game.js';

describe('신규 개선 항목 7: 이적 마감시한 패닉 바이(D-day 프리미엄, 앱 통합)', () => {
  it('협상 없이 즉시 확정 영입되고, 신규 스쿼드에 합류한다', () => {
    const g = startGame(2026, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const player = otherClub.players[otherClub.players.length - 1]!;

    const r = panicBuyAction(g, player.id);
    expect(r.ok).toBe(true);
    expect(myClub(r.state).players.some((p) => p.id === player.id)).toBe(true);
    expect(r.message).toContain('패닉 바이');
  });

  it('예산이 부족하면 거절된다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    club.finance.transferBudget = 0;
    club.finance.balance = 0;
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const player = otherClub.players[0]!;

    const r = panicBuyAction(g, player.id);
    expect(r.ok).toBe(false);
  });

  it('시즌 진행 중에는 사용할 수 없다', () => {
    const g = startGame(2028, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const player = otherClub.players[0]!;
    const liveState = { ...g, live: true };

    const r = panicBuyAction(liveState, player.id);
    expect(r.ok).toBe(false);
  });
});
