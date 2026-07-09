import { describe, it, expect } from 'vitest';
import {
  startGame, startSeason, playRound, checkMediaEvent, respondMedia, dismissMedia, myClub,
  managerPersona, managerSnsReputation,
} from '../src/game.js';
import { SNS_BASE_FOLLOWERS } from '@soccer-tycoon/engine';

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

  it('이미 처리된 이벤트를 들고 재호출(이중 클릭)해도 사기·신뢰도가 두 번 반영되지 않는다', () => {
    let g = advanceUntilMyMatchPlayed(startSeason(startGame(2026, 'c5')));
    const event = checkMediaEvent(g);
    if (!event) return;
    const option = event.options[0]!;
    g = respondMedia(g, event, option.tone);
    const afterFirst = g;
    // 같은(오래된) event 객체로 재호출 — checkMediaEvent는 더 이상 이 이벤트를
    // 반환하지 않지만, 호출자가 들고 있던 값으로 다시 호출할 수 있다.
    g = respondMedia(g, event, option.tone);
    expect(g).toBe(afterFirst);
  });

  it('응답한 톤이 mediaToneCounts에 누적된다', () => {
    let g = advanceUntilMyMatchPlayed(startSeason(startGame(2026, 'c5')));
    const event = checkMediaEvent(g);
    if (!event) return;
    const tone = event.options[0]!.tone;
    expect(g.mediaToneCounts[tone]).toBe(0);
    g = respondMedia(g, event, tone);
    expect(g.mediaToneCounts[tone]).toBe(1);
    const otherTotal = Object.entries(g.mediaToneCounts)
      .filter(([t]) => t !== tone)
      .reduce((s, [, c]) => s + c, 0);
    expect(otherTotal).toBe(0);
  });

  it('managerPersona: 표본이 적으면 neutral, bold/humble 톤이 확실히 우세하면 그 이미지로 굳어진다', () => {
    const base = startGame(2026, 'c5');
    expect(managerPersona(base)).toBe('neutral');

    const bold = { ...base, mediaToneCounts: { ...base.mediaToneCounts, confident: 4, blameRef: 1 } };
    expect(managerPersona(bold)).toBe('bold');

    const humble = { ...base, mediaToneCounts: { ...base.mediaToneCounts, humble: 4, accountable: 1 } };
    expect(managerPersona(humble)).toBe('humble');

    const tied = { ...base, mediaToneCounts: { ...base.mediaToneCounts, confident: 3, humble: 3 } };
    expect(managerPersona(tied)).toBe('neutral');
  });

  it('고도화 Item19: 인터뷰 응답이 없으면 기본 팔로워·여론이고, 누적되면 함께 반응한다', () => {
    const base = startGame(2030, 'c6');
    expect(managerSnsReputation(base).followers).toBe(SNS_BASE_FOLLOWERS);
    expect(managerSnsReputation(base).approval).toBe(50);

    const boldHeavy = { ...base, mediaToneCounts: { ...base.mediaToneCounts, confident: 5 } };
    const humbleHeavy = { ...base, mediaToneCounts: { ...base.mediaToneCounts, humble: 5 } };
    expect(managerSnsReputation(boldHeavy).followers).toBeGreaterThan(SNS_BASE_FOLLOWERS);
    expect(managerSnsReputation(boldHeavy).followers).toBeGreaterThan(managerSnsReputation(humbleHeavy).followers);
    expect(managerSnsReputation(humbleHeavy).approval).toBeGreaterThan(50);
    expect(managerSnsReputation(boldHeavy).approval).toBeLessThan(50);
  });
});
