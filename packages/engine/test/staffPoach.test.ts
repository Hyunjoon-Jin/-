import { describe, it, expect } from 'vitest';
import { poachStaff, hireInitialStaffMembers } from '../src/staffActions.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function league(seed: number, n = 2): Club[] {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  for (let i = 0; i < n; i++) clubs.push(generateClub(rng, `c${i}`, `C${i}`, 12));
  for (const c of clubs) c.finance.balance = 1_000_000_000;
  return clubs;
}

describe('고도화 Item10: 스태프 이적시장', () => {
  it('같은 구단에서는 영입할 수 없다', () => {
    const clubs = league(1);
    const r = poachStaff(clubs, 'c0', 'c0', 'coaching', new Rng(1));
    expect(r.ok).toBe(false);
  });

  it('해당 직책에 실명 인물이 없으면 거절된다', () => {
    const clubs = league(2);
    clubs[1]!.staff.members = {};
    const r = poachStaff(clubs, 'c0', 'c1', 'coaching', new Rng(1));
    expect(r.ok).toBe(false);
  });

  it('충분히 많은 시도 중 성사되면 인물이 내 구단으로 옮겨오고 원 소속엔 새 인물이 채워진다', () => {
    const clubs = league(3);
    const target = clubs[1]!;
    const originalName = target.staff.members!.coaching!.name;
    let succeeded = false;
    for (let i = 0; i < 30 && !succeeded; i++) {
      const fresh = league(3);
      const r = poachStaff(fresh, 'c0', 'c1', 'coaching', new Rng(i));
      if (r.ok) {
        succeeded = true;
        const me = fresh.find((c) => c.id === 'c0')!;
        const them = fresh.find((c) => c.id === 'c1')!;
        expect(me.staff.members?.coaching?.name).toBe(originalName);
        expect(them.staff.members?.coaching?.name).not.toBe(originalName);
        expect(r.fee).toBeGreaterThan(0);
      }
    }
    expect(succeeded).toBe(true);
  });

  it('영입에 성공하면 이적료가 내 구단에서 상대 구단으로 이체된다', () => {
    let found = false;
    for (let i = 0; i < 30 && !found; i++) {
      const clubs = league(4);
      const me = clubs.find((c) => c.id === 'c0')!;
      const them = clubs.find((c) => c.id === 'c1')!;
      const balBefore = me.finance.balance;
      const theirBalBefore = them.finance.balance;
      const r = poachStaff(clubs, 'c0', 'c1', 'coaching', new Rng(i));
      if (r.ok) {
        found = true;
        expect(me.finance.balance).toBe(balBefore - r.fee!);
        expect(them.finance.balance).toBe(theirBalBefore + r.fee!);
      }
    }
    expect(found).toBe(true);
  });

  it('내 구단 레벨이 영입한 인물의 레벨보다 낮았다면 그 레벨로 올라간다', () => {
    let found = false;
    for (let i = 0; i < 30 && !found; i++) {
      const clubs = league(5);
      const me = clubs.find((c) => c.id === 'c0')!;
      const them = clubs.find((c) => c.id === 'c1')!;
      me.staff.coaching = 1;
      them.staff.coaching = 15;
      them.staff.members = hireInitialStaffMembers(them.id, them.staff);
      const r = poachStaff(clubs, 'c0', 'c1', 'coaching', new Rng(i));
      if (r.ok) {
        found = true;
        expect(me.staff.coaching).toBe(15);
      }
    }
    expect(found).toBe(true);
  });

  it('보유 자금이 부족하면 거절된다', () => {
    const clubs = league(6);
    clubs[0]!.finance.balance = 0;
    const r = poachStaff(clubs, 'c0', 'c1', 'coaching', new Rng(1));
    expect(r.ok).toBe(false);
  });

  it('구단을 찾을 수 없으면 거절된다', () => {
    const clubs = league(7);
    const r = poachStaff(clubs, 'c0', 'nonexistent', 'coaching', new Rng(1));
    expect(r.ok).toBe(false);
  });
});
