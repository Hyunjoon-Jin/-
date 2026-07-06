import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, myClub } from '../src/game.js';
import { STAFF_RETIRE_HARD_AGE } from '@soccer-tycoon/engine';

describe('신규 개선 항목 17: 스태프 은퇴 (앱 통합)', () => {
  it('하드컷 나이 직전인 코치는 시즌 종료 시 은퇴하고 시즌 요약에 실린다', () => {
    const g0 = startGame(2026, 'c0');
    const club = myClub(g0);
    const member = club.staff.members!.medical!;
    member.age = STAFF_RETIRE_HARD_AGE - 1;
    const before = { ...member };

    const g1 = advanceFullSeason(g0);
    const summary = g1.history.at(-1)!;
    const event = summary.staffRetirements?.find((r) => r.kind === 'medical');
    expect(event).toBeDefined();
    expect(event!.name).toBe(before.name);
    expect(event!.finalAge).toBe(STAFF_RETIRE_HARD_AGE);
    expect(myClub(g1).staff.members!.medical!.name).toBe(event!.replacementName);
  });

  it('젊은 스태프뿐이면 시즌 요약에 은퇴 항목이 없다', () => {
    const g0 = startGame(2027, 'c0');
    const club = myClub(g0);
    for (const kind of ['coaching', 'medical', 'scouting', 'youth'] as const) {
      club.staff.members![kind]!.age = 40;
    }
    const g1 = advanceFullSeason(g0);
    const summary = g1.history.at(-1)!;
    expect(summary.staffRetirements ?? []).toEqual([]);
  });
});
