import { describe, it, expect } from 'vitest';
import { isValidInstruction } from '@soccer-tycoon/engine';
import { startGame, myClub, myTactic } from '../src/game.js';
import { swapPlayer, setPlayerInstruction, repairTactic } from '../src/tactics.js';

describe('tactics: swapPlayer', () => {
  it('범위 밖 slotIndex는 크래시 없이 전술을 그대로 반환한다', () => {
    const g = startGame(2026, 'c0');
    const tactic = myTactic(g);
    const anyPlayerId = myClub(g).players[0]!.id;
    expect(() => swapPlayer(tactic, tactic.lineup.length + 5, anyPlayerId)).not.toThrow();
    expect(() => swapPlayer(tactic, -1, anyPlayerId)).not.toThrow();
    expect(swapPlayer(tactic, tactic.lineup.length + 5, anyPlayerId)).toEqual(tactic);
    expect(swapPlayer(tactic, -1, anyPlayerId)).toEqual(tactic);
  });

  it('유효한 slotIndex는 정상적으로 교체된다', () => {
    const g = startGame(2026, 'c0');
    const tactic = myTactic(g);
    const bench = myClub(g).players.find((p) => !tactic.lineup.some((s) => s.playerId === p.id))!;
    const next = swapPlayer(tactic, 0, bench.id);
    expect(next.lineup[0]!.playerId).toBe(bench.id);
  });

  it('선수를 교체해도 슬롯에 걸린 개인 지시(F10)는 그대로 유지된다(포지션에 붙은 지시라서)', () => {
    const g = startGame(2027, 'c0');
    const tactic = myTactic(g);
    const drIndex = tactic.lineup.findIndex((s) => s.position === 'DR');
    const withInstruction = setPlayerInstruction(tactic, drIndex, { kind: 'manMark', targetPosition: 'AML' });
    const bench = myClub(g).players.find((p) => !withInstruction.lineup.some((s) => s.playerId === p.id))!;
    const next = swapPlayer(withInstruction, drIndex, bench.id);
    expect(next.lineup[drIndex]!.playerId).toBe(bench.id);
    expect(next.lineup[drIndex]!.instruction).toEqual({ kind: 'manMark', targetPosition: 'AML' });
  });
});

describe('tactics: setPlayerInstruction', () => {
  it('슬롯에 지시를 지정·해제할 수 있다', () => {
    const g = startGame(2028, 'c0');
    const tactic = myTactic(g);
    const amlIndex = tactic.lineup.findIndex((s) => s.position === 'AML' || s.position === 'ML' || s.position === 'MR' || s.position === 'AMR');
    const withInstruction = setPlayerInstruction(tactic, amlIndex, { kind: 'cutInside' });
    expect(withInstruction.lineup[amlIndex]!.instruction).toEqual({ kind: 'cutInside' });
    const cleared = setPlayerInstruction(withInstruction, amlIndex, undefined);
    expect(cleared.lineup[amlIndex]!.instruction).toBeUndefined();
  });

  it('범위 밖 slotIndex는 크래시 없이 전술을 그대로 반환한다', () => {
    const g = startGame(2029, 'c0');
    const tactic = myTactic(g);
    expect(() => setPlayerInstruction(tactic, tactic.lineup.length + 5, { kind: 'cutInside' })).not.toThrow();
    expect(setPlayerInstruction(tactic, -1, { kind: 'cutInside' })).toEqual(tactic);
  });
});

describe('tactics: repairTactic — 개인 지시(F10) 승계·무효화 + 커스텀 포메이션(F14) 지원', () => {
  it('기존 슬롯의 지시가 보존된다', () => {
    const g = startGame(2030, 'c0');
    const tactic = myTactic(g);
    const drIndex = tactic.lineup.findIndex((s) => s.position === 'DR');
    const withInstruction = setPlayerInstruction(tactic, drIndex, { kind: 'manMark', targetPosition: 'AML' });
    const repaired = repairTactic(myClub(g), withInstruction);
    const drSlot = repaired.lineup.find((s) => s.position === 'DR');
    expect(drSlot?.instruction).toEqual({ kind: 'manMark', targetPosition: 'AML' });
  });

  it('포지션은 engine의 FORMATIONS 테이블이 아니라 기존 라인업 슬롯 자체에서 온다(F14 커스텀 포메이션 지원) — 정상 경로에선 낡은 지시가 생기지 않는다', () => {
    const g = startGame(2031, 'c0');
    const tactic = myTactic(g);
    // engine의 FORMATIONS엔 등록돼 있지 않은 이름이어도, 라인업 슬롯 자체의 포지션만으로 복원된다.
    const customNamedTactic = { ...tactic, formation: '나만의 포메이션' };
    const repaired = repairTactic(myClub(g), customNamedTactic);
    expect(repaired.lineup.map((s) => s.position)).toEqual(tactic.lineup.map((s) => s.position));
  });

  it('슬롯에 손상된(포지션과 맞지 않는) 지시가 남아있으면 방어적으로 제거한다', () => {
    const g = startGame(2032, 'c0');
    const tactic = myTactic(g);
    const dcIndex = tactic.lineup.findIndex((s) => s.position === 'DC');
    // 정상 경로로는 나올 수 없는 상태(DC에 좁혀 들어오기)를 직접 주입해 방어 로직을 검증.
    const corrupted = {
      ...tactic,
      lineup: tactic.lineup.map((s, i) => (i === dcIndex ? { ...s, instruction: { kind: 'cutInside' as const } } : s)),
    };
    const repaired = repairTactic(myClub(g), corrupted);
    expect(repaired.lineup[dcIndex]!.instruction).toBeUndefined();
    for (const slot of repaired.lineup) {
      expect(isValidInstruction(slot.position, slot.instruction)).toBe(true);
    }
  });
});
