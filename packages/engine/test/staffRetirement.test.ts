import { describe, it, expect } from 'vitest';
import {
  tickStaffContracts, staffRetireChance, STAFF_RETIRE_MIN_AGE, STAFF_RETIRE_HARD_AGE,
} from '../src/staffActions.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

describe('신규 개선 항목 17: 스태프 은퇴', () => {
  it('기준 나이 미만이면 은퇴 확률은 0이다', () => {
    expect(staffRetireChance(STAFF_RETIRE_MIN_AGE - 1)).toBe(0);
    expect(staffRetireChance(20)).toBe(0);
  });

  it('나이가 오를수록 은퇴 확률이 커지고 0.95를 넘지 않는다', () => {
    const low = staffRetireChance(STAFF_RETIRE_MIN_AGE);
    const high = staffRetireChance(STAFF_RETIRE_MIN_AGE + 10);
    expect(high).toBeGreaterThan(low);
    expect(staffRetireChance(200)).toBeLessThanOrEqual(0.95);
  });

  it('실명 스태프는 매 오프시즌 한 살씩 나이를 먹는다', () => {
    const club = generateClub(new Rng(7), 'c', 'C', 10);
    const before = club.staff.members!.coaching!.age;
    tickStaffContracts(club, new Rng(1));
    // 은퇴하지 않았다면 정확히 +1, 은퇴했다면 후임(젊은 나이)으로 교체됐을 것이다.
    const after = club.staff.members!.coaching!.age;
    expect(after === before + 1 || after < before).toBe(true);
  });

  it('은퇴 하드컷 나이(STAFF_RETIRE_HARD_AGE) 이상이면 확률과 무관하게 반드시 은퇴한다', () => {
    const club = generateClub(new Rng(3), 'c', 'C', 10);
    club.staff.members!.medical!.age = STAFF_RETIRE_HARD_AGE - 1; // tick 후 정확히 하드컷 나이
    const before = { ...club.staff.members!.medical! };
    const { retirements } = tickStaffContracts(club, new Rng(0)); // roll(0.95)도 항상 실패하는 시드 필요 없음 — 하드컷이 우선
    const event = retirements.find((r) => r.kind === 'medical');
    expect(event).toBeDefined();
    expect(event!.name).toBe(before.name);
    expect(event!.finalAge).toBe(STAFF_RETIRE_HARD_AGE);
    expect(club.staff.members!.medical!.name).not.toBe(before.name);
    expect(club.staff.members!.medical!.age).toBeLessThan(STAFF_RETIRE_HARD_AGE);
  });

  it('은퇴하면 즉시 같은 자리에 새 인물이 영입되어 공백이 없다', () => {
    const club = generateClub(new Rng(3), 'c', 'C', 10);
    club.staff.members!.scouting!.age = STAFF_RETIRE_HARD_AGE - 1;
    const { retirements } = tickStaffContracts(club, new Rng(0));
    const event = retirements.find((r) => r.kind === 'scouting');
    expect(event).toBeDefined();
    expect(club.staff.members!.scouting!).toBeDefined();
    expect(club.staff.members!.scouting!.name).toBe(event!.replacementName);
    expect(club.staff.members!.scouting!.contractYears).toBeGreaterThanOrEqual(1);
  });

  it('계약이 아직 많이 남아있어도 고령이면 은퇴할 수 있다(계약 상태와 무관)', () => {
    const club = generateClub(new Rng(3), 'c', 'C', 10);
    club.staff.members!.youth!.age = STAFF_RETIRE_HARD_AGE - 1;
    club.staff.members!.youth!.contractYears = 4; // 계약 넉넉히 남음
    const { retirements } = tickStaffContracts(club, new Rng(0));
    expect(retirements.some((r) => r.kind === 'youth')).toBe(true);
  });

  it('젊은 스태프는(기준 나이 미만) 은퇴하지 않는다', () => {
    const club = generateClub(new Rng(5), 'c', 'C', 10);
    for (const kind of ['coaching', 'medical', 'scouting', 'youth'] as const) {
      club.staff.members![kind]!.age = 40;
    }
    const { retirements } = tickStaffContracts(club, new Rng(2));
    expect(retirements).toEqual([]);
  });
});
