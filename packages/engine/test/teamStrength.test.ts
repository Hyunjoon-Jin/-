import { describe, it, expect } from 'vitest';
import { computeTeamStrength, lineOf } from '../src/teamStrength.js';
import { generateClub, defaultTactic } from '../src/generate.js';
import { Rng } from '../src/rng.js';

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
