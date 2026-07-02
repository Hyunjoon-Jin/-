import { describe, it, expect } from 'vitest';
import {
  startGame, advanceFullSeason, contractOptions, signContract, myClub,
} from '../src/game.js';

describe('감독 계약', () => {
  it('새 게임은 3시즌짜리 계약으로 시작하고, 계약이 남아있는 동안은 갱신 제안이 없다', () => {
    const g = startGame(2026, 'c0');
    expect(g.contractSeasonsLeft).toBe(3);
    expect(g.ambition).toBe(0);
    expect(contractOptions(g)).toBeNull();
  });

  it('시즌이 끝날 때마다 계약 잔여가 줄고, 0 이하가 되면 갱신 선택지가 생긴다', () => {
    let g = startGame(2026, 'c0');
    g = advanceFullSeason(g);
    expect(g.contractSeasonsLeft).toBe(2);
    expect(contractOptions(g)).toBeNull();
    g = advanceFullSeason(g);
    expect(g.contractSeasonsLeft).toBe(1);
    g = advanceFullSeason(g);
    expect(g.contractSeasonsLeft).toBe(0);
    expect(contractOptions(g)).not.toBeNull();
    expect(contractOptions(g)!.map((o) => o.years)).toEqual([1, 3]);
  });

  it('경질 상태면 계약 잔여와 무관하게 갱신 제안이 없다', () => {
    let g = startGame(2026, 'c0');
    g = { ...g, contractSeasonsLeft: 0, sacked: true };
    expect(contractOptions(g)).toBeNull();
  });

  it('1년 계약을 체결하면 신뢰도가 소폭 오르고 목표는 그대로 유지된다', () => {
    let g = startGame(2026, 'c0');
    g = { ...g, contractSeasonsLeft: 0 };
    const objBefore = g.objective;
    const confBefore = g.boardConfidence;
    g = signContract(g, 1);
    expect(g.contractSeasonsLeft).toBe(1);
    expect(g.boardConfidence).toBe(confBefore + 3);
    expect(g.ambition).toBe(0);
    expect(g.objective).toBe(objBefore);
  });

  it('3년 계약을 체결하면 신뢰도가 크게 오르지만 ambition이 쌓여 목표가 더 엄격해진다', () => {
    let g = startGame(2026, 'c0');
    g = { ...g, contractSeasonsLeft: 0 };
    const objBefore = g.objective;
    const confBefore = g.boardConfidence;
    g = signContract(g, 3);
    expect(g.contractSeasonsLeft).toBe(3);
    expect(g.boardConfidence).toBe(confBefore + 10);
    expect(g.ambition).toBe(1);
    // 1부는 낮은 순위 숫자가 더 엄격 → objective가 1 감소(또는 이미 1이면 유지)
    expect(g.objective).toBeLessThanOrEqual(objBefore);
  });

  it('장기 계약을 반복 체결하면 ambition이 누적돼 다음 시즌 목표가 계속 엄격해진다', () => {
    let g = startGame(2026, 'c0');
    g = { ...g, contractSeasonsLeft: 0 };
    g = signContract(g, 3);
    const ambitionAfterFirst = g.ambition;
    g = advanceFullSeason(g);
    expect(g.ambition).toBe(ambitionAfterFirst); // 시즌 진행으로는 변하지 않음
    g = { ...g, contractSeasonsLeft: 0 };
    g = signContract(g, 3);
    expect(g.ambition).toBe(ambitionAfterFirst + 1);
  });

  it('알 수 없는 계약 기간을 넘기면 상태가 변하지 않는다', () => {
    let g = startGame(2026, 'c0');
    g = { ...g, contractSeasonsLeft: 0 };
    const before = g;
    const after = signContract(g, 99);
    expect(after).toBe(before);
  });

  it('myClub 헬퍼가 정상 동작해 계약 로직이 올바른 구단을 참조한다', () => {
    const g = startGame(2026, 'c0');
    expect(myClub(g).id).toBe('c0');
  });
});
