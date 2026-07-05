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

describe('tactics: repairTactic — 개인 지시(F10) 승계·무효화', () => {
  it('포메이션이 그대로면 기존 슬롯의 지시가 보존된다', () => {
    const g = startGame(2030, 'c0');
    const tactic = myTactic(g);
    const drIndex = tactic.lineup.findIndex((s) => s.position === 'DR');
    const withInstruction = setPlayerInstruction(tactic, drIndex, { kind: 'manMark', targetPosition: 'AML' });
    const repaired = repairTactic(myClub(g), withInstruction);
    const drSlot = repaired.lineup.find((s) => s.position === 'DR');
    expect(drSlot?.instruction).toEqual({ kind: 'manMark', targetPosition: 'AML' });
  });

  it('포메이션이 바뀌어 같은 인덱스의 포지션이 지시 자격을 잃으면 낡은 지시는 버려진다', () => {
    const g = startGame(2031, 'c0');
    const tactic = myTactic(g); // 4-3-3: 인덱스 8 = AML(좁혀 들어오기 자격)
    const amlIndex = tactic.lineup.findIndex((s) => s.position === 'AML');
    const withInstruction = setPlayerInstruction(tactic, amlIndex, { kind: 'cutInside' });
    // 3-5-2로 전환하면 같은 인덱스가 WBR(전담마크 자격만 있고 좁혀 들어오기 자격은 없음)이 된다.
    const switched = { ...withInstruction, formation: '3-5-2' };
    const repaired = repairTactic(myClub(g), switched);
    expect(repaired.lineup[amlIndex]!.position).toBe('WBR');
    expect(repaired.lineup[amlIndex]!.instruction).toBeUndefined();
    // 결과 라인업 전체가 항상 유효성 규칙을 만족한다(일반화된 불변식 확인).
    for (const slot of repaired.lineup) {
      expect(isValidInstruction(slot.position, slot.instruction)).toBe(true);
    }
  });
});
