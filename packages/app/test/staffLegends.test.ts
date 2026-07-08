import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, myClub } from '../src/game.js';
import { STAFF_RETIRE_HARD_AGE } from '@soccer-tycoon/engine';

describe('고도화 Item36: 스태프 레전드 명예의 전당', () => {
  it('하드컷 나이 직전인 코치가 은퇴하면 명예의 전당에 영구 기록된다', () => {
    const g0 = startGame(2026, 'c0');
    const club = myClub(g0);
    const member = club.staff.members!.medical!;
    member.age = STAFF_RETIRE_HARD_AGE - 1;
    const before = { ...member };
    const levelBefore = club.staff.medical;

    const g1 = advanceFullSeason(g0);
    expect(g1.staffLegends).toBeDefined();
    const legend = g1.staffLegends!.find((l) => l.kind === 'medical');
    expect(legend).toBeDefined();
    expect(legend!.name).toBe(before.name);
    expect(legend!.finalAge).toBe(STAFF_RETIRE_HARD_AGE);
    expect(legend!.level).toBe(levelBefore);
    expect(legend!.trait).toBe(before.trait);
    expect(legend!.season).toBe(1);
  });

  it('여러 시즌에 걸쳐 은퇴가 발생하면 명예의 전당에 누적되고 리셋되지 않는다', () => {
    let g = startGame(2026, 'c0');
    for (const kind of ['coaching', 'medical', 'scouting', 'youth'] as const) {
      myClub(g).staff.members![kind]!.age = STAFF_RETIRE_HARD_AGE - 1;
    }
    g = advanceFullSeason(g);
    const after1 = g.staffLegends?.length ?? 0;
    expect(after1).toBeGreaterThan(0);

    for (const kind of ['coaching', 'medical', 'scouting', 'youth'] as const) {
      myClub(g).staff.members![kind]!.age = STAFF_RETIRE_HARD_AGE - 1;
    }
    g = advanceFullSeason(g);
    const after2 = g.staffLegends?.length ?? 0;
    expect(after2).toBeGreaterThan(after1);
  });

  it('젊은 스태프뿐이면 명예의 전당에 새 항목이 추가되지 않는다', () => {
    const g0 = startGame(2027, 'c0');
    const club = myClub(g0);
    for (const kind of ['coaching', 'medical', 'scouting', 'youth'] as const) {
      club.staff.members![kind]!.age = 40;
    }
    const g1 = advanceFullSeason(g0);
    expect(g1.staffLegends ?? []).toEqual([]);
  });
});
