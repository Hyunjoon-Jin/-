import { describe, it, expect } from 'vitest';
import {
  checkInternationalRetirements, internationalRetireChance, selectCallUps,
  INTL_RETIRE_MIN_AGE, INTL_RETIRE_MIN_CAPS,
} from '../src/international.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';

describe('신규 개선 항목 19: 선수 국가대표 은퇴 이벤트', () => {
  it('기준 나이·캡 미달이면 은퇴 확률은 0이다', () => {
    expect(internationalRetireChance(INTL_RETIRE_MIN_AGE - 1, 100)).toBe(0);
    expect(internationalRetireChance(40, INTL_RETIRE_MIN_CAPS - 1)).toBe(0);
  });

  it('나이가 오를수록 은퇴 확률이 커지고 0.6을 넘지 않는다', () => {
    const low = internationalRetireChance(INTL_RETIRE_MIN_AGE, 50);
    const high = internationalRetireChance(INTL_RETIRE_MIN_AGE + 10, 50);
    expect(high).toBeGreaterThan(low);
    expect(internationalRetireChance(100, 200)).toBeLessThanOrEqual(0.6);
  });

  it('은퇴가 확정되면(고령·다수 캡) internationalRetired가 true로 설정되고 이벤트가 반환된다', () => {
    const club = generateClub(new Rng(4), 'c', 'C', 14);
    const p = club.players[0]!;
    p.age = 45; p.caps = 50; p.internationalRetired = undefined;
    const events = checkInternationalRetirements([club], new Rng(0)); // roll(0.6 미만이라도 항상 성공하는 시드 필요 없음 — 45세면 확률 0.6(상한)
    // 상한 0.6이라 100% 보장은 아니므로 여러 시드로 반드시 한 번은 트리거되는지 확인
    let found = events.some((e) => e.playerId === p.id);
    for (let seed = 1; seed < 50 && !found; seed++) {
      p.internationalRetired = undefined;
      found = checkInternationalRetirements([club], new Rng(seed)).some((e) => e.playerId === p.id);
    }
    expect(found).toBe(true);
    expect(p.internationalRetired).toBe(true);
  });

  it('이미 은퇴한 선수는 다시 판정하지 않는다(이벤트 중복 없음)', () => {
    const club = generateClub(new Rng(4), 'c', 'C', 14);
    const p = club.players[0]!;
    p.age = 45; p.caps = 50; p.internationalRetired = true;
    const events = checkInternationalRetirements([club], new Rng(1));
    expect(events.some((e) => e.playerId === p.id)).toBe(false);
  });

  it('국가대표 은퇴자는 selectCallUps 차출 대상에서 제외된다', () => {
    const club = generateClub(new Rng(9), 'c', 'C', 18);
    const target = club.players[0]!;
    target.internationalRetired = true;
    // minCA=0으로 능력 기준을 무력화해, 은퇴 여부만이 포함 여부를 가르게 한다.
    const called = selectCallUps([club], 23, 0);
    expect(called.some((p) => p.id === target.id)).toBe(false);
  });
});
