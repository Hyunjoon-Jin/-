import { describe, it, expect } from 'vitest';
import {
  confidenceDelta, applyConfidence, boardStatus, isSacked,
  START_CONFIDENCE, SACK_THRESHOLD,
} from '../src/board.js';

describe('board: 이사회 신뢰도', () => {
  it('목표 초과 달성은 +, 미달은 −', () => {
    const over = confidenceDelta({ position: 3, objective: 9, promoted: false, relegated: false, netFinance: 100 });
    const under = confidenceDelta({ position: 12, objective: 9, promoted: false, relegated: false, netFinance: 100 });
    expect(over).toBeGreaterThan(0);
    expect(under).toBeLessThan(0);
  });

  it('목표 정확 달성은 재정만 반영(소폭 +)', () => {
    const d = confidenceDelta({ position: 9, objective: 9, promoted: false, relegated: false, netFinance: 100 });
    expect(d).toBe(2); // posDelta 0 + finDelta 2
  });

  it('승격은 크게 +, 강등은 크게 −', () => {
    const promo = confidenceDelta({ position: 1, objective: 3, promoted: true, relegated: false, netFinance: 0 });
    const releg = confidenceDelta({ position: 12, objective: 9, promoted: false, relegated: true, netFinance: 0 });
    expect(promo).toBeGreaterThan(20);
    expect(releg).toBeLessThan(-20);
  });

  it('변화량은 [-40, 38]로 제한', () => {
    const worst = confidenceDelta({ position: 20, objective: 1, promoted: false, relegated: true, netFinance: -999999 });
    const best = confidenceDelta({ position: 1, objective: 20, promoted: true, relegated: false, netFinance: 999999 });
    expect(worst).toBe(-40);
    expect(best).toBe(38);
  });

  it('promoted와 relegated가 동시에 참이면 호출자 오류로 보고 예외를 던진다', () => {
    expect(() => confidenceDelta({
      position: 5, objective: 5, promoted: true, relegated: true, netFinance: 0,
    })).toThrow();
  });

  it('applyConfidence는 0~100 클램프', () => {
    expect(applyConfidence(5, -20)).toBe(0);
    expect(applyConfidence(95, 20)).toBe(100);
    expect(applyConfidence(55, 10)).toBe(65);
  });

  it('상태 구간과 경질 판정', () => {
    expect(boardStatus(80)).toBe('secure');
    expect(boardStatus(50)).toBe('stable');
    expect(boardStatus(30)).toBe('shaky');
    expect(boardStatus(10)).toBe('critical');
    expect(isSacked(SACK_THRESHOLD - 1)).toBe(true);
    expect(isSacked(SACK_THRESHOLD)).toBe(false);
    expect(isSacked(START_CONFIDENCE)).toBe(false);
  });

  it('여러 시즌 연속 부진이면 경질 수준까지 하락', () => {
    let c = START_CONFIDENCE;
    for (let i = 0; i < 4; i++) {
      c = applyConfidence(c, confidenceDelta({ position: 12, objective: 6, promoted: false, relegated: true, netFinance: -50000 }));
    }
    expect(isSacked(c)).toBe(true);
  });
});
