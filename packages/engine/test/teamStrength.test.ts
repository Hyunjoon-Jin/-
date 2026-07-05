import { describe, it, expect } from 'vitest';
import { computeTeamStrength, lineOf, formationMatchup } from '../src/teamStrength.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { Tactic } from '../src/types.js';

function makeClub(seed = 1) {
  const rng = new Rng(seed);
  return generateClub(rng, 'h', 'Home', 13);
}

describe('teamStrength: 라인 전멸 시 붕괴 페널티', () => {
  it('수비 라인이 전원 결장(부상)이면 중립 폴백(25~30)이 아닌 붕괴 수준으로 떨어진다', () => {
    const club = makeClub(1);
    const tactic = defaultTactic(club);
    const before = computeTeamStrength(club, tactic);

    const defIds = new Set(
      tactic.lineup.filter((s) => lineOf(s.position) === 'DEF').map((s) => s.playerId),
    );
    for (const p of club.players) {
      if (defIds.has(p.id)) p.injuryMatches = 3; // 전원 결장 처리
    }
    const after = computeTeamStrength(club, tactic);

    // 중립 폴백(25~30)이 그대로 남았다면 소폭 하락에 그쳤을 것 — 붕괴 페널티가 실제로
    // 반영되면 원래 수치의 절반 미만으로 크게 떨어진다.
    expect(after.defense).toBeLessThan(before.defense * 0.5);
  });

  it('골키퍼가 전원 결장이면 중립 폴백(25)이 아닌 붕괴 수준으로 떨어진다', () => {
    const club = makeClub(2);
    const tactic = defaultTactic(club);
    const before = computeTeamStrength(club, tactic);

    const gkIds = new Set(
      tactic.lineup.filter((s) => lineOf(s.position) === 'GK').map((s) => s.playerId),
    );
    for (const p of club.players) {
      if (gkIds.has(p.id)) p.injuryMatches = 3;
    }
    const after = computeTeamStrength(club, tactic);

    expect(after.gk).toBeLessThan(before.gk);
    expect(after.gk).toBeLessThan(15);
  });
});

describe('F02: 포메이션 상성 매트릭스', () => {
  it('정의된 조합은 상성 보정을 반환한다', () => {
    expect(formationMatchup('4-2-3-1', '3-5-2')).toEqual({ key: 'midfield', mul: 1.05 });
  });

  it('정의되지 않은 조합은 undefined(중립)를 반환한다', () => {
    expect(formationMatchup('4-3-3', '4-4-2')).toBeUndefined();
    expect(formationMatchup('4-3-3', '4-3-3')).toBeUndefined();
  });

  it('상대 포메이션을 넘기면 상성 보정이 실제로 전력 지표에 반영된다', () => {
    const club = makeClub(3);
    const tactic: Tactic = { ...defaultTactic(club), formation: '4-2-3-1' };
    const withoutMatchup = computeTeamStrength(club, tactic);
    const withMatchup = computeTeamStrength(club, tactic, false, '3-5-2');
    expect(withMatchup.midfield).toBeCloseTo(Math.min(withoutMatchup.midfield * 1.05, 110), 5);
  });

  it('상성 보정이 없는 상대 포메이션이면 결과가 그대로다', () => {
    const club = makeClub(4);
    const tactic: Tactic = { ...defaultTactic(club), formation: '4-3-3' };
    const withoutOpp = computeTeamStrength(club, tactic);
    const withUnrelatedOpp = computeTeamStrength(club, tactic, false, '4-4-2');
    expect(withUnrelatedOpp).toEqual(withoutOpp);
  });
});
