import { describe, it, expect } from 'vitest';
import { startGame, myClub, poachStaffAction } from '../src/game.js';

describe('고도화 Item10: 스태프 이적시장 (앱 통합)', () => {
  it('같은 구단에서는 영입할 수 없다', () => {
    const g = startGame(2026, 'c0');
    const r = poachStaffAction(g, g.myClubId, 'coaching');
    expect(r.ok).toBe(false);
  });

  it('여러 시도 중 성사되면 상대 구단 인물이 내 구단으로 옮겨온다', () => {
    const g = startGame(2027, 'c0');
    const targetClubId = g.clubs.find((c) => c.id !== g.myClubId)!.id;
    const targetMemberBefore = g.clubs.find((c) => c.id === targetClubId)!.staff.members?.coaching?.name;

    let succeeded: ReturnType<typeof poachStaffAction> | undefined;
    for (let attempt = 0; attempt < 30 && !succeeded?.ok; attempt++) {
      const r = poachStaffAction(g, targetClubId, 'coaching', attempt);
      if (r.ok) succeeded = r;
    }
    expect(succeeded?.ok).toBe(true);
    const myMember = myClub(succeeded!.state).staff.members?.coaching?.name;
    expect(myMember).toBe(targetMemberBefore);
  });

  it('보유 자금이 부족하면 거절된다', () => {
    const g = startGame(2028, 'c0');
    myClub(g).finance.balance = 0;
    const targetClubId = g.clubs.find((c) => c.id !== g.myClubId)!.id;
    const r = poachStaffAction(g, targetClubId, 'coaching');
    expect(r.ok).toBe(false);
  });
});
