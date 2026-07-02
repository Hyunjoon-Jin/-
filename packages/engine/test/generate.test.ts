import { describe, it, expect } from 'vitest';
import { generateClub, defaultTactic, potentialBonusRange } from '../src/generate.js';
import { Rng } from '../src/rng.js';

describe('generate: 잠재력 보너스 나이 보간', () => {
  it('22→23세 경계에서 계단식으로 뚝 떨어지지 않고 인접 나이대와 매끈하게 이어진다', () => {
    // 예전엔 22세 상한(40)·23세 상한(10)이 나이 한 살 차이로 계단식 절벽이었다.
    const [, hi22] = potentialBonusRange(22);
    const [, hi23] = potentialBonusRange(23);
    expect(Math.abs(hi22 - hi23)).toBeLessThanOrEqual(3);
  });

  it('전 연령대에 걸쳐 보너스 상한이 나이가 들수록 단조 감소한다(계단 없이)', () => {
    for (let age = 17; age < 34; age++) {
      const [, hiNow] = potentialBonusRange(age);
      const [, hiNext] = potentialBonusRange(age + 1);
      expect(hiNext).toBeLessThanOrEqual(hiNow);
      expect(hiNow - hiNext).toBeLessThanOrEqual(3); // 급격한 단절 없음
    }
  });

  it('보너스 하한은 항상 상한 이하다', () => {
    for (let age = 17; age <= 34; age++) {
      const [lo, hi] = potentialBonusRange(age);
      expect(lo).toBeLessThanOrEqual(hi);
    }
  });
});

describe('generate: A매치 캡 상한 도달 가능성', () => {
  it('CA가 최댓값(200)에 가까운 선수는 캡 상한(90) 근처까지 도달할 수 있다(예전엔 최대 14 정도)', () => {
    // tier를 극단적으로 높여 CA가 200에 가까운 선수들을 다수 생성, 최댓값 확인.
    let maxCaps = 0;
    for (let s = 0; s < 20; s++) {
      const rng = new Rng(s + 1);
      const club = generateClub(rng, 'c', 'C', 20);
      for (const p of club.players) maxCaps = Math.max(maxCaps, p.caps);
    }
    expect(maxCaps).toBeGreaterThan(30); // 예전 공식의 사실상 상한(약 14)을 명확히 상회
  });
});

describe('generate: defaultTactic 스쿼드 부족 가드', () => {
  it('포메이션 인원수보다 스쿼드가 적으면 중복 배정 대신 에러를 던진다', () => {
    const rng = new Rng(1);
    const club = generateClub(rng, 'c', 'C', 12);
    club.players = club.players.slice(0, 5); // 4-3-3(11명)보다 적게
    expect(() => defaultTactic(club)).toThrow();
  });

  it('정상 스쿼드에서는 라인업에 중복 선수가 없다', () => {
    const rng = new Rng(3);
    const club = generateClub(rng, 'c', 'C', 12);
    const tactic = defaultTactic(club);
    const ids = tactic.lineup.map((s) => s.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
