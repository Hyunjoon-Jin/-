import { describe, it, expect } from 'vitest';
import { pickCaptain, ensureCaptain } from '../src/tactics.js';
import { startGame, myClub, myTactic } from '../src/game.js';

describe('신규 개선 항목 16: 주장 후보 추천 로직 (앱 통합)', () => {
  it('pickCaptain은 현재 라인업 안에서 주장 추천 점수가 가장 높은 선수를 고른다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const tactic = myTactic(g);
    const captainId = pickCaptain(club, tactic.lineup);
    expect(captainId).toBeDefined();
    expect(tactic.lineup.some((s) => s.playerId === captainId)).toBe(true);
  });

  it('ensureCaptain은 현재 주장이 라인업에 그대로 있으면 바꾸지 않는다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const tactic = myTactic(g);
    const current = tactic.lineup[0]!.playerId;
    expect(ensureCaptain(club, tactic.lineup, current)).toBe(current);
  });

  it('ensureCaptain은 현재 주장이 라인업에서 빠지면 새로 추천한다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    const tactic = myTactic(g);
    const missingId = 'no-such-player-id';
    const next = ensureCaptain(club, tactic.lineup, missingId);
    expect(next).not.toBe(missingId);
    expect(tactic.lineup.some((s) => s.playerId === next)).toBe(true);
  });
});
