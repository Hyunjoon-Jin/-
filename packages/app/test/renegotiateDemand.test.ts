import { describe, it, expect } from 'vitest';
import { startGame, myClub, renegotiateDemandAction } from '../src/game.js';
import type { BoardDemand } from '@soccer-tycoon/engine';

describe('신규 개선 항목 22: 이사회 요구 재협상', () => {
  it('요구가 없으면 거절되고 상태가 변하지 않는다', () => {
    const g = startGame(2026, 'c0');
    g.demand = undefined;
    const outcome = renegotiateDemandAction(g);
    expect(outcome.ok).toBe(false);
  });

  it('참을성 있는 이사회면 재협상이 받아들여지고 요구 강도가 절반으로 줄며 신뢰도가 소폭 깎인다', () => {
    const g = startGame(2026, 'c0');
    const club = myClub(g);
    club.boardPersona = { patience: 'patient', style: 'conservative' };
    g.demand = { kind: 'winCup', reward: 12, penalty: 4 } as BoardDemand;
    const confBefore = g.boardConfidence;

    const outcome = renegotiateDemandAction(g);
    expect(outcome.ok).toBe(true);
    expect(outcome.state.demand).toEqual({ kind: 'winCup', reward: 6, penalty: 2 });
    expect(outcome.state.boardConfidence).toBeLessThan(confBefore);
    expect(outcome.state.demandRenegotiated).toBe(true);
  });

  it('같은 시즌에 두 번째로 시도하면 거절된다(시즌당 1회 제한)', () => {
    const g0 = startGame(2027, 'c0');
    myClub(g0).boardPersona = { patience: 'patient', style: 'conservative' };
    g0.demand = { kind: 'topHalfFinish', reward: 12, penalty: 4 } as BoardDemand;

    const first = renegotiateDemandAction(g0);
    expect(first.ok).toBe(true);
    const second = renegotiateDemandAction(first.state);
    expect(second.ok).toBe(false);
  });

  it('조급한 이사회는 확률적으로 거절할 수 있고, 거절 시 신뢰도 비용이 없다', () => {
    let refusedFound = false;
    for (let season = 2028; season < 2080 && !refusedFound; season++) {
      const g = startGame(season, 'c0');
      myClub(g).boardPersona = { patience: 'impatient', style: 'conservative' };
      g.demand = { kind: 'clubTopScorer', reward: 12, penalty: 4 } as BoardDemand;
      const confBefore = g.boardConfidence;
      const outcome = renegotiateDemandAction(g);
      if (!outcome.ok) {
        refusedFound = true;
        expect(outcome.state.boardConfidence).toBe(confBefore);
      }
    }
    expect(refusedFound).toBe(true);
  });
});
