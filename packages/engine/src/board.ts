/**
 * 이사회 신뢰도 — 실패 조건(경질 압박).
 * 시즌 성적이 보드진 목표(리그 순위) 대비 어떤지, 승강·재정이 어땠는지로
 * 신뢰도가 오르내린다. 바닥나면 경질(게임 오버)로 이어진다.
 * 순수 로직만 두어 헤드리스로 검증 가능.
 */
import { clamp } from './math.js';

/** 시작 신뢰도(중립보다 약간 높게). */
export const START_CONFIDENCE = 55;
/** 이 미만이면 경질. */
export const SACK_THRESHOLD = 8;

export interface SeasonConfidenceInput {
  /** 리그 최종 순위(1-index). */
  position: number;
  /** 보드진 목표 순위(이 이내면 성공). */
  objective: number;
  promoted: boolean;
  relegated: boolean;
  /** 시즌 순수익(만원). */
  netFinance: number;
}

/**
 * 시즌 결과에 따른 신뢰도 변화량.
 * 목표보다 잘하면 +, 못하면 −. 승격·강등·재정이 가감된다.
 */
export function confidenceDelta(inp: SeasonConfidenceInput): number {
  if (inp.promoted && inp.relegated) {
    throw new Error('confidenceDelta: promoted와 relegated가 동시에 참일 수 없습니다(호출자 계산 오류).');
  }
  const posDelta = clamp((inp.objective - inp.position) * 2.5, -28, 25);
  const promoDelta = inp.promoted ? 25 : inp.relegated ? -30 : 0;
  const finDelta = inp.netFinance >= 0 ? 2 : -6;
  return Math.round(clamp(posDelta + promoDelta + finDelta, -40, 38));
}

/** 신뢰도에 변화량 적용(0~100). */
export function applyConfidence(current: number, delta: number): number {
  return clamp(current + delta, 0, 100);
}

export type BoardStatus = 'secure' | 'stable' | 'shaky' | 'critical';

/** 신뢰도 구간 → 상태. critical(경고)~하한 미만은 경질. */
export function boardStatus(confidence: number): BoardStatus {
  if (confidence >= 70) return 'secure';
  if (confidence >= 45) return 'stable';
  if (confidence >= 25) return 'shaky';
  return 'critical';
}

/** 경질 여부. */
export function isSacked(confidence: number): boolean {
  return confidence < SACK_THRESHOLD;
}
