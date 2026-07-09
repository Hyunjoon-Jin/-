import { describe, it, expect } from 'vitest';
import { startGame, myClub, advanceFullSeason, lastSummary } from '../src/game.js';

describe('고도화 Item17: 회장 교체 이벤트 (앱 통합)', () => {
  it('시즌을 여러 번 진행하다 보면 언젠가 내 구단 회장 교체 소식이 시즌 요약에 실린다', () => {
    let g = startGame(2026, 'c0');
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      g = advanceFullSeason(g);
      const change = lastSummary(g)?.boardPersonaChange;
      if (change) {
        found = true;
        expect(change.clubId).toBe(myClub(g).id);
        expect(change.newPersona).not.toEqual(change.oldPersona);
      }
    }
    expect(found).toBe(true);
  });
});
