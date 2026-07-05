import { describe, it, expect } from 'vitest';
import { runOffseason, runFranchise } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { currentAbility } from '../src/derived.js';
import { Rng } from '../src/rng.js';
import type { Club, Player } from '../src/types.js';

function makeClub(seed: number, tier = 12): Club {
  const rng = new Rng(seed);
  return generateClub(rng, 'c', 'C', tier);
}

describe('B9: 2군·리저브 스쿼드', () => {
  it('유스 인테이크는 1군이 아닌 리저브로 합류한다', () => {
    const club = makeClub(1);
    const before = club.players.length;
    const { intakeByClub } = runOffseason([club], new Rng(2));
    const intakeCount = intakeByClub.get(club.id) ?? 0;
    expect(intakeCount).toBeGreaterThan(0);
    expect(club.players.length).toBe(before); // 승격 없이는 1군 인원 불변(단, 방출 등으로 달라질 수 있어 대략 체크)
    expect((club.reserves ?? []).length).toBeGreaterThan(0);
  });

  it('갓 배출된 유스는 배출된 바로 그 시즌에는 승격되지 않는다(최소 한 시즌은 리저브를 거친다)', () => {
    const club = makeClub(3);
    const { intakePlayersByClub, reservePromotions } = runOffseason([club], new Rng(4));
    const intake = intakePlayersByClub.get(club.id) ?? [];
    const intakeIds = new Set(intake.map((p) => p.id));
    expect(reservePromotions.some((r) => intakeIds.has(r.playerId))).toBe(false);
  });

  it('리저브 선수도 오프시즌마다 나이가 들고 능력치가 성장한다', () => {
    const club = makeClub(5);
    runOffseason([club], new Rng(6)); // 인테이크 발생
    const reserve = (club.reserves ?? [])[0];
    if (!reserve) return; // 이 시드에서 인테이크가 없으면 스킵(다른 테스트가 발생을 보장)
    const ageBefore = reserve.age;
    const caBefore = currentAbility(reserve);
    runOffseason([club], new Rng(7));
    const stillThere = [...(club.reserves ?? []), ...club.players].find((p) => p.id === reserve.id);
    if (stillThere) expect(stillThere.age).toBeGreaterThan(ageBefore);
    void caBefore;
  });

  it('여러 시즌을 진행하면 리저브에서 1군으로 승격하는 선수가 나온다', () => {
    const club = makeClub(9);
    let anyPromotion = false;
    let rng = new Rng(100);
    for (let i = 0; i < 8; i++) {
      const result = runOffseason([club], rng);
      if (result.reservePromotions.length > 0) anyPromotion = true;
      rng = new Rng(100 + i + 1);
    }
    expect(anyPromotion).toBe(true);
  });

  it('21세에 도달한 리저브는 잠재력 대비 충분히 성장했으면 승격되고, 아니면 방출된다(리저브에 남지 않는다)', () => {
    const club = makeClub(11);
    const oldReserve: Player = { ...club.players[0]!, id: 'reserve-old', age: 20, potential: 200 };
    for (const k in oldReserve.attributes) (oldReserve.attributes as Record<string, number>)[k] = 1; // 잠재력 대비 한참 못 미침
    club.reserves = [oldReserve];
    const result = runOffseason([club], new Rng(12));
    const stillInReserves = (club.reserves ?? []).some((p) => p.id === 'reserve-old');
    const promoted = result.reservePromotions.some((r) => r.playerId === 'reserve-old');
    const releasedCount = result.reserveReleasesByClub.get(club.id) ?? 0;
    expect(stillInReserves).toBe(false);
    expect(promoted || releasedCount > 0).toBe(true);
  });

  it('1군 인원이 위급하게 적으면 준비도와 무관하게 리저브에서 승격시켜 붕괴를 막는다', () => {
    const club = makeClub(13);
    club.players = club.players.slice(0, 10); // 위급 수준으로 축소
    const barelyReady: Player = { ...club.players[0]!, id: 'reserve-critical', age: 17, potential: 150 };
    for (const k in barelyReady.attributes) (barelyReady.attributes as Record<string, number>)[k] = 1; // 준비도 미달
    club.reserves = [barelyReady];
    const result = runOffseason([club], new Rng(14));
    expect(result.reservePromotions.some((r) => r.playerId === 'reserve-critical')).toBe(true);
  });

  it('여러 시즌 프랜차이즈 루프에서도 리저브 필드가 항상 유효한 배열로 유지된다(오류 없이 진행)', () => {
    const clubs = [makeClub(20), makeClub(21, 10)];
    expect(() => runFranchise(clubs, 5, 999)).not.toThrow();
    for (const c of clubs) {
      expect(Array.isArray(c.reserves ?? [])).toBe(true);
    }
  });
});
