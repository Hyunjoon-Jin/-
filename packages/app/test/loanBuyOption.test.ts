import { describe, it, expect } from 'vitest';
import { startGame, myClub, loanIn, exerciseBuyOption } from '../src/game.js';

describe('신규 개선 항목 4: 임대 우선매수옵션(OTB, 앱 통합)', () => {
  it('우선매수옵션을 걸고 임대 데려오면 이후 exerciseBuyOption으로 완전 영입할 수 있다', () => {
    const g = startGame(2026, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const player = otherClub.players[otherClub.players.length - 1]!;

    const loanOutcome = loanIn(g, player.id, otherClub.id, {
      seasons: 2, fee: 0, wageShareByParent: 0, buyOption: { fee: 20000 },
    });
    expect(loanOutcome.ok).toBe(true);
    expect(myClub(loanOutcome.state).players.some((p) => p.id === player.id)).toBe(true);

    const exercised = exerciseBuyOption(loanOutcome.state, player.id);
    expect(exercised.ok).toBe(true);
    const afterPlayer = myClub(exercised.state).players.find((p) => p.id === player.id)!;
    expect(afterPlayer.loanFromClubId).toBeUndefined();
    expect(afterPlayer.loanBuyOption).toBeUndefined();
  });

  it('옵션 없이 임대한 선수는 exerciseBuyOption이 거절된다', () => {
    const g = startGame(2027, 'c0');
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const player = otherClub.players[otherClub.players.length - 1]!;
    const loanOutcome = loanIn(g, player.id, otherClub.id, { seasons: 1, fee: 0, wageShareByParent: 0 });
    expect(loanOutcome.ok).toBe(true);

    const exercised = exerciseBuyOption(loanOutcome.state, player.id);
    expect(exercised.ok).toBe(false);
  });
});
