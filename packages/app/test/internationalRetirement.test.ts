import { describe, it, expect } from 'vitest';
import { startGame, advanceFullSeason, myClub } from '../src/game.js';
import { INTL_RETIRE_MIN_CAPS } from '@soccer-tycoon/engine';

describe('신규 개선 항목 19: 선수 국가대표 은퇴 이벤트 (앱 통합)', () => {
  it('국가대표 은퇴 기준 나이·캡을 갖춘 선수는 여러 시즌에 걸쳐 결국 은퇴를 선언한다', () => {
    // 일반 선수 은퇴(RETIRE_MIN_AGE=33 미만이면 확률 0)에 걸리지 않도록 나이를 32세로
    // 매 시즌 전에 고정해, 국가대표 은퇴 확률만 반복 판정되게 한다. 스쿼드 정리로
    // 특정 선수가 빠질 수 있으니 매 시즌 첫 번째 선수를 새로 골라 강제 지정한다.
    let g = startGame(2026, 'c0');

    let found = false;
    for (let i = 0; i < 150 && !found; i++) {
      const player = myClub(g).players[0]!;
      player.age = 32;
      player.caps = INTL_RETIRE_MIN_CAPS + 10;
      g = advanceFullSeason(g);
      const summary = g.history.at(-1)!;
      if ((summary.internationalRetirements ?? []).length > 0) found = true;
    }
    expect(found).toBe(true);
  });

  it('젊은 선수는 국가대표 은퇴 이벤트가 발생하지 않는다', () => {
    const g0 = startGame(2027, 'c0');
    for (const p of myClub(g0).players) { p.age = 22; p.caps = 0; }
    const g1 = advanceFullSeason(g0);
    const summary = g1.history.at(-1)!;
    expect(summary.internationalRetirements ?? []).toEqual([]);
  });
});
