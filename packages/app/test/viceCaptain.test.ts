import { describe, it, expect } from 'vitest';
import { startGame, myClub, myTactic } from '../src/game.js';
import {
  pickCaptain, pickViceCaptain, ensureCaptain, ensureViceCaptain, repairTactic, swapPlayer,
} from '../src/tactics.js';

describe('고도화 Item14: 부주장·완장 자동 승계', () => {
  it('defaultTactic 생성 직후에도 주장과 다른 선수가 부주장으로 자동 지정된다', () => {
    const g = startGame(2026, 'c0');
    const tactic = myTactic(g);
    const club = myClub(g);
    const captainId = pickCaptain(club, tactic.lineup);
    const viceCaptainId = pickViceCaptain(club, tactic.lineup, captainId);
    expect(viceCaptainId).toBeDefined();
    expect(viceCaptainId).not.toBe(captainId);
  });

  it('부주장이 라인업에서 빠지면(포지션 교체) repairTactic이 다시 자동 지정한다', () => {
    const g = startGame(2027, 'c0');
    const club = myClub(g);
    const tactic = myTactic(g);
    const captainId = pickCaptain(club, tactic.lineup);
    const viceCaptainId = pickViceCaptain(club, tactic.lineup, captainId);
    const bench = club.players.find((p) => !tactic.lineup.some((s) => s.playerId === p.id))!;
    const viceSlotIndex = tactic.lineup.findIndex((s) => s.playerId === viceCaptainId);
    const swapped = swapPlayer({ ...tactic, captainId, viceCaptainId }, viceSlotIndex, bench.id);
    const repaired = repairTactic(club, swapped);
    expect(repaired.viceCaptainId).toBeDefined();
    expect(repaired.lineup.some((s) => s.playerId === repaired.viceCaptainId)).toBe(true);
    expect(repaired.viceCaptainId).not.toBe(repaired.captainId);
  });

  it('ensureViceCaptain은 주장과 겹치는 부주장을 다시 자동 지정한다', () => {
    const g = startGame(2028, 'c0');
    const club = myClub(g);
    const tactic = myTactic(g);
    const captainId = pickCaptain(club, tactic.lineup);
    // 의도적으로 주장과 부주장을 동일 인물로 설정(잘못된 상태) 후 보정 확인.
    const result = ensureViceCaptain(club, tactic.lineup, captainId, captainId);
    expect(result).not.toBe(captainId);
  });
});
