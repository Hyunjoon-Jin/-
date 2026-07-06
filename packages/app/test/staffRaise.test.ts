import { describe, it, expect } from 'vitest';
import { startGame, myClub, negotiateStaffRaiseAction } from '../src/game.js';
import { STAFF_RAISE_ELIGIBLE_YEARS, STAFF_RAISE_EXTENSION_YEARS } from '@soccer-tycoon/engine';

describe('신규 개선 항목 12: 코치 계약 협상(연봉 인상 요구, 앱 통합)', () => {
  it('계약 만료가 임박한 코치의 연봉 인상을 수락하면 계약이 연장된다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const member = club.staff.members!.coaching!;
    member.contractYears = STAFF_RAISE_ELIGIBLE_YEARS;
    const balBefore = club.finance.balance;

    const outcome = negotiateStaffRaiseAction(g, 'coaching');
    expect(outcome.ok).toBe(true);
    expect(member.contractYears).toBe(STAFF_RAISE_EXTENSION_YEARS);
    expect(club.finance.balance).toBeLessThan(balBefore);
  });

  it('계약이 아직 많이 남았으면 거절된다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    club.staff.members!.medical!.contractYears = STAFF_RAISE_ELIGIBLE_YEARS + 3;

    const outcome = negotiateStaffRaiseAction(g, 'medical');
    expect(outcome.ok).toBe(false);
  });
});
