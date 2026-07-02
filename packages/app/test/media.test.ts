import { describe, it, expect } from 'vitest';
import {
  startGame, startSeason, playRound, checkMediaEvent, respondMedia, dismissMedia, myClub,
} from '../src/game.js';

/** 내 경기가 있었던 라운드까지 진행한다(최대 round 12까지 탐색). */
function advanceUntilMyMatchPlayed(g: ReturnType<typeof startGame>) {
  for (let i = 0; i < 12; i++) {
    g = playRound(g);
    if (checkMediaEvent(g)) return g;
  }
  return g;
}

describe('media: 감독 인터뷰(앱 레이어)', () => {
  it('같은 시드는 같은 라운드에서 같은 인터뷰(kind)를 노출한다(재현성)', () => {
    const a = advanceUntilMyMatchPlayed(startSeason(startGame(2026, 'c5')));
    const b = advanceUntilMyMatchPlayed(startSeason(startGame(2026, 'c5')));
    const ea = checkMediaEvent(a);
    const eb = checkMediaEvent(b);
    expect(ea?.round).toBe(eb?.round);
    expect(ea?.kind).toBe(eb?.kind);
  });

  it('응답 후에는 같은 라운드에 대해 다시 노출되지 않는다', () => {
    let g = advanceUntilMyMatchPlayed(startSeason(startGame(2026, 'c5')));
    const event = checkMediaEvent(g);
    if (!event) return; // 이 시드에서 트리거되지 않으면 스킵
    g = respondMedia(g, event, event.options[0]!.tone);
    expect(checkMediaEvent(g)).toBeNull();
  });

  it('응답의 사기 델타가 내 구단 선수단에 반영된다', () => {
    let g = advanceUntilMyMatchPlayed(startSeason(startGame(2026, 'c5')));
    const event = checkMediaEvent(g);
    if (!event) return;
    const before = myClub(g).players.map((p) => p.morale);
    const option = event.options[0]!;
    g = respondMedia(g, event, option.tone);
    const after = myClub(g).players.map((p) => p.morale);
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).toBeCloseTo(Math.min(1, Math.max(0, before[i]! + option.moraleDelta)), 5);
    }
  });

  it('노코멘트(dismiss)는 사기·신뢰도를 바꾸지 않고 재노출만 막는다', () => {
    let g = advanceUntilMyMatchPlayed(startSeason(startGame(2026, 'c5')));
    const event = checkMediaEvent(g);
    if (!event) return;
    const confBefore = g.boardConfidence;
    const moraleBefore = myClub(g).players.map((p) => p.morale);
    g = dismissMedia(g, event);
    expect(g.boardConfidence).toBe(confBefore);
    const moraleAfter = myClub(g).players.map((p) => p.morale);
    expect(moraleAfter).toEqual(moraleBefore);
    expect(checkMediaEvent(g)).toBeNull();
  });
});
