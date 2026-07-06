import { describe, it, expect } from 'vitest';
import { findCupUpsets, CUP_UPSET_REP_GAP, type CupState } from '../src/cup.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Club } from '../src/types.js';

function clubWithRep(id: string, rep: number): Club {
  const c = generateClub(new Rng(1), id, id.toUpperCase(), 12);
  c.finance.reputation = rep;
  return c;
}

function makeCup(clubs: Club[], rounds: CupState['rounds']): CupState {
  return { participantIds: clubs.map((c) => c.id), rounds, baseSeed: 1, championId: null };
}

describe('신규 개선 항목 29: 컵대회 이변(자이언트 킬링) 추적', () => {
  it('평판 격차가 기준 이상이고 하위 팀이 이기면 이변으로 판정한다', () => {
    const strong = clubWithRep('strong', 18);
    const weak = clubWithRep('weak', 18 - CUP_UPSET_REP_GAP);
    const cup = makeCup([strong, weak], [{
      name: '8강',
      ties: [{ homeId: weak.id, awayId: strong.id, homeScore: 1, awayScore: 0, penalties: false, winnerId: weak.id }],
    }]);
    const upsets = findCupUpsets([strong, weak], cup);
    expect(upsets).toHaveLength(1);
    expect(upsets[0]!.winnerId).toBe(weak.id);
    expect(upsets[0]!.loserId).toBe(strong.id);
    expect(upsets[0]!.repGap).toBe(CUP_UPSET_REP_GAP);
  });

  it('평판 격차가 기준에 못 미치면 이변으로 치지 않는다', () => {
    const strong = clubWithRep('strong', 12);
    const weak = clubWithRep('weak', 12 - CUP_UPSET_REP_GAP + 1);
    const cup = makeCup([strong, weak], [{
      name: '8강',
      ties: [{ homeId: weak.id, awayId: strong.id, homeScore: 1, awayScore: 0, penalties: false, winnerId: weak.id }],
    }]);
    expect(findCupUpsets([strong, weak], cup)).toHaveLength(0);
  });

  it('강팀이 이기면(예상대로) 이변이 아니다', () => {
    const strong = clubWithRep('strong', 18);
    const weak = clubWithRep('weak', 6);
    const cup = makeCup([strong, weak], [{
      name: '8강',
      ties: [{ homeId: strong.id, awayId: weak.id, homeScore: 2, awayScore: 0, penalties: false, winnerId: strong.id }],
    }]);
    expect(findCupUpsets([strong, weak], cup)).toHaveLength(0);
  });

  it('부전승은 이변 판정 대상에서 제외된다', () => {
    const strong = clubWithRep('strong', 18);
    const cup = makeCup([strong], [{
      name: '8강',
      ties: [{ homeId: strong.id, awayId: null, homeScore: null, awayScore: null, penalties: false, winnerId: strong.id }],
    }]);
    expect(findCupUpsets([strong], cup)).toHaveLength(0);
  });

  it('여러 라운드에 걸쳐 이변을 모두 찾는다', () => {
    const strong = clubWithRep('strong', 18);
    const mid = clubWithRep('mid', 12);
    const weak = clubWithRep('weak', 6);
    const cup = makeCup([strong, mid, weak], [
      {
        name: '8강',
        ties: [{ homeId: weak.id, awayId: strong.id, homeScore: 1, awayScore: 0, penalties: false, winnerId: weak.id }],
      },
      {
        name: '준결승',
        ties: [{ homeId: weak.id, awayId: mid.id, homeScore: 2, awayScore: 1, penalties: false, winnerId: weak.id }],
      },
    ]);
    const upsets = findCupUpsets([strong, mid, weak], cup);
    expect(upsets).toHaveLength(2);
  });
});
