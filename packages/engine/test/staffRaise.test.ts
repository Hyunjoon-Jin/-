import { describe, it, expect } from 'vitest';
import {
  hireInitialStaffMembers, negotiateStaffRaise, staffRaiseCost,
  STAFF_RAISE_ELIGIBLE_YEARS, STAFF_RAISE_EXTENSION_YEARS,
} from '../src/staffActions.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function makeClub(seed: number): Club {
  const rng = new Rng(seed);
  const club = generateClub(rng, 'c', 'C', 12);
  club.staff.members = hireInitialStaffMembers(club.id, club.staff);
  club.finance.balance = 500_000_000;
  return club;
}

describe('신규 개선 항목 12: 코치 계약 협상(연봉 인상 요구)', () => {
  it('계약 만료가 임박하지 않은 스태프는 협상을 걸 수 없다', () => {
    const club = makeClub(1);
    club.staff.members!.coaching!.contractYears = STAFF_RAISE_ELIGIBLE_YEARS + 3;
    const r = negotiateStaffRaise(club, 'coaching');
    expect(r.ok).toBe(false);
  });

  it('계약 만료가 임박하면 비용을 지불하고 계약을 연장할 수 있다', () => {
    const club = makeClub(2);
    const member = club.staff.members!.coaching!;
    member.contractYears = STAFF_RAISE_ELIGIBLE_YEARS;
    const before = club.finance.balance;
    const cost = staffRaiseCost(club.staff.coaching);
    const name = member.name;

    const r = negotiateStaffRaise(club, 'coaching');
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(cost);
    expect(club.finance.balance).toBe(before - cost);
    expect(member.contractYears).toBe(STAFF_RAISE_EXTENSION_YEARS);
    expect(member.name).toBe(name); // 같은 인물이 유지된다(교체가 아니라 재계약)
  });

  it('자금이 부족하면 협상이 거절되고 계약 기간은 그대로다', () => {
    const club = makeClub(3);
    const member = club.staff.members!.coaching!;
    member.contractYears = 0;
    club.finance.balance = 0;

    const r = negotiateStaffRaise(club, 'coaching');
    expect(r.ok).toBe(false);
    expect(member.contractYears).toBe(0);
  });

  it('실명 스태프가 없는(구버전 세이브) 구단에서는 안전하게 거절된다', () => {
    const club = makeClub(4);
    club.staff.members = undefined;
    const r = negotiateStaffRaise(club, 'coaching');
    expect(r.ok).toBe(false);
  });

  it('레벨이 높을수록 협상 비용이 더 크다', () => {
    expect(staffRaiseCost(15)).toBeGreaterThan(staffRaiseCost(5));
  });
});
