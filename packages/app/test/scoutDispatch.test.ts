import { describe, it, expect } from 'vitest';
import { startGame, myClub, dispatchScoutAction, isScouted, revealPotential } from '../src/game.js';

describe('B13: 스카우트 파견 (앱 통합)', () => {
  it('파견에 성공하면 isScouted가 true가 되고 자금이 차감된다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    club.finance.balance = 10_000_000;
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const target = otherClub.players[0]!;
    const before = club.finance.balance;

    expect(isScouted(g, target.id)).toBe(false);
    const outcome = dispatchScoutAction(g, target.id);
    expect(outcome.ok).toBe(true);
    expect(isScouted(outcome.state, target.id)).toBe(true);
    expect(myClub(outcome.state).finance.balance).toBeLessThan(before);
  });

  it('파견 후에는 스카우팅 레벨과 무관하게 revealPotential이 정확한 값을 낸다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    club.finance.balance = 10_000_000;
    club.staff.scouting = 1; // 완전 안개 레벨
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const target = otherClub.players[0]!;

    expect(revealPotential(club.staff.scouting, target.potential)).toBe('?');
    const outcome = dispatchScoutAction(g, target.id);
    expect(outcome.ok).toBe(true);
    const scouted = isScouted(outcome.state, target.id);
    expect(revealPotential(club.staff.scouting, target.potential, scouted)).toBe(target.potential.toFixed(0));
  });

  it('자금이 부족하면 파견이 거절된다', () => {
    const g = startGame(2028, 'c0');
    const club = myClub(g);
    club.finance.balance = 0;
    const otherClub = g.clubs.find((c) => c.id !== g.myClubId)!;
    const target = otherClub.players[0]!;
    const outcome = dispatchScoutAction(g, target.id);
    expect(outcome.ok).toBe(false);
  });
});
