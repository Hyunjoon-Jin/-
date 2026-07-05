import { describe, it, expect } from 'vitest';
import {
  boldPredictionTarget, evaluateBoldPrediction, BOLD_PREDICTION_MARGIN,
  BOLD_PREDICTION_BONUS_CONFIDENCE, BOLD_PREDICTION_PENALTY_CONFIDENCE,
} from '../src/board.js';

describe('신규 개선 항목 25: 대담한 목표 공개 선언', () => {
  it('선언 가능 목표는 이사회 목표보다 마진만큼 높다(더 낮은 순위 숫자)', () => {
    expect(boldPredictionTarget(10)).toBe(10 - BOLD_PREDICTION_MARGIN);
  });

  it('선언 가능 목표는 1위 밑으로 내려가지 않는다', () => {
    expect(boldPredictionTarget(1)).toBe(1);
    expect(boldPredictionTarget(2)).toBe(1);
  });

  it('선언한 목표까지 달성하면 met=true, 신뢰도에 보너스가 붙는다', () => {
    const result = evaluateBoldPrediction(4, 3, 7);
    expect(result.met).toBe(true);
    expect(result.missedObjective).toBe(false);
    expect(result.confidenceAdjust).toBe(BOLD_PREDICTION_BONUS_CONFIDENCE);
  });

  it('선언한 목표에는 못 미쳤지만 원래 이사회 목표는 달성하면 추가 효과가 없다', () => {
    const result = evaluateBoldPrediction(4, 6, 7);
    expect(result.met).toBe(false);
    expect(result.missedObjective).toBe(false);
    expect(result.confidenceAdjust).toBe(0);
  });

  it('원래 이사회 목표조차 놓치면 추가 페널티가 붙는다', () => {
    const result = evaluateBoldPrediction(4, 9, 7);
    expect(result.met).toBe(false);
    expect(result.missedObjective).toBe(true);
    expect(result.confidenceAdjust).toBe(-BOLD_PREDICTION_PENALTY_CONFIDENCE);
  });

  it('선언한 목표와 정확히 같은 순위면 달성으로 친다(경계값)', () => {
    const result = evaluateBoldPrediction(4, 4, 7);
    expect(result.met).toBe(true);
  });

  it('이사회 목표와 정확히 같은 순위면 목표 실패로 치지 않는다(경계값)', () => {
    const result = evaluateBoldPrediction(4, 7, 7);
    expect(result.missedObjective).toBe(false);
    expect(result.confidenceAdjust).toBe(0);
  });
});
