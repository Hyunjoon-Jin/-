import { describe, it, expect } from 'vitest';
import { maybeChangeBoardPersona, BOARD_PERSONA_CHANGE_CHANCE } from '../src/board.js';
import { runOffseason } from '../src/franchise.js';
import { generateClub } from '../src/generate.js';
import { Rng } from '../src/rng.js';
import type { BoardPersona } from '../src/types.js';

describe('고도화 Item17: 회장 교체 이벤트', () => {
  it('BOARD_PERSONA_CHANGE_CHANCE는 낮은 확률(서사적 희귀 이벤트)이다', () => {
    expect(BOARD_PERSONA_CHANGE_CHANCE).toBeGreaterThan(0);
    expect(BOARD_PERSONA_CHANGE_CHANCE).toBeLessThan(0.2);
  });

  it('발생하면 반드시 기존과 다른 조합의 성향으로 바뀐다', () => {
    const current: BoardPersona = { patience: 'patient', style: 'conservative' };
    let changed = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const next = maybeChangeBoardPersona(current, new Rng(seed));
      if (next) {
        changed++;
        expect(next.patience !== current.patience || next.style !== current.style).toBe(true);
      }
    }
    // 300회 시도 중 낮은 확률로나마 여러 번 발생해야 한다(전혀 발생 안 하면 로직이 죽은 것).
    expect(changed).toBeGreaterThan(0);
  });

  it('runOffseason에서 회장 교체가 발생한 구단은 club.boardPersona가 실제로 갱신된다', () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const rng = new Rng(seed);
      const club = generateClub(rng, 'c', 'C', 12);
      const before = { ...club.boardPersona! };
      const result = runOffseason([club], new Rng(seed + 1000));
      const change = result.boardPersonaChanges.find((e) => e.clubId === club.id);
      if (change) {
        found = true;
        expect(club.boardPersona).toEqual(change.newPersona);
        expect(change.oldPersona).toEqual(before);
        expect(change.newPersona).not.toEqual(before);
      }
    }
    expect(found).toBe(true);
  });

  it('boardPersona가 없는(구버전 세이브) 구단은 회장 교체 대상에서 제외된다', () => {
    const rng = new Rng(5);
    const club = generateClub(rng, 'c', 'C', 12);
    club.boardPersona = undefined;
    for (let i = 0; i < 30; i++) {
      const result = runOffseason([club], new Rng(i));
      expect(result.boardPersonaChanges.some((e) => e.clubId === club.id)).toBe(false);
    }
  });
});
