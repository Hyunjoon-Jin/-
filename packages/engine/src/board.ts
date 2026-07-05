/**
 * 이사회 신뢰도 — 실패 조건(경질 압박).
 * 시즌 성적이 보드진 목표(리그 순위) 대비 어떤지, 승강·재정이 어땠는지로
 * 신뢰도가 오르내린다. 바닥나면 경질(게임 오버)로 이어진다.
 * 순수 로직만 두어 헤드리스로 검증 가능.
 */
import { clamp } from './math.js';
import type { BoardPatience, BoardStyle, BoardPersona } from './types.js';

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

/** 목표 미달(음수 posDelta) 시 가감 배율 — 인내심 있는 보드는 관대하고, 조급한 보드는 가혹하다. */
const PATIENCE_UNDERPERFORM_MUL: Record<BoardPatience, number> = { patient: 0.7, impatient: 1.3 };
/** 재정 결과(finDelta) 가감 배율 — 보수적인 보드는 재정에 민감하고, 공격적인 보드는 성적만 본다. */
const STYLE_FINANCE_MUL: Record<BoardStyle, number> = { conservative: 1.4, aggressive: 0.6 };

/**
 * 시즌 결과에 따른 신뢰도 변화량.
 * 목표보다 잘하면 +, 못하면 −. 승격·강등·재정이 가감된다.
 * persona(이사회 성향)가 주어지면 목표 미달 시 가혹함(patience)과 재정 민감도(style)가
 * 구단마다 다르게 반영된다. 생략하면(하위 호환) 배율 1.0 — 기존 계산과 완전히 동일하다.
 */
export function confidenceDelta(inp: SeasonConfidenceInput, persona?: BoardPersona): number {
  if (inp.promoted && inp.relegated) {
    throw new Error('confidenceDelta: promoted와 relegated가 동시에 참일 수 없습니다(호출자 계산 오류).');
  }
  const rawPosDelta = (inp.objective - inp.position) * 2.5;
  const patienceMul = persona ? PATIENCE_UNDERPERFORM_MUL[persona.patience] : 1;
  // 목표 초과 달성(양수)은 성향과 무관하게 그대로, 미달(음수)만 인내심에 따라 가감.
  const posDelta = clamp(rawPosDelta < 0 ? rawPosDelta * patienceMul : rawPosDelta, -28, 25);
  const promoDelta = inp.promoted ? 25 : inp.relegated ? -30 : 0;
  const styleMul = persona ? STYLE_FINANCE_MUL[persona.style] : 1;
  const finDelta = (inp.netFinance >= 0 ? 2 : -6) * styleMul;
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

const BOARD_STATUS_RANK: Record<BoardStatus, number> = { critical: 0, shaky: 1, stable: 2, secure: 3 };
/** 신뢰 등급 한 단계 상승당 지급되는 기본 투자 보너스(만원) — 평판이 높을수록 가산된다. */
const BOARD_UPGRADE_BONUS_PER_TIER = 8_000;

/**
 * 이사회 신뢰 등급이 이번 시즌에 실제로 한 단계 이상 올랐을 때만 지급되는 일회성
 * 투자 예산 승인 보너스. 매 시즌 반복되는 소득이 아니라 "등급 상승 달성"에 대한
 * 보상이라, 이미 최고 등급(secure)을 유지만 하는 구단에는 지급되지 않는다.
 */
export function boardTierUpgradeBonus(prevStatus: BoardStatus, newStatus: BoardStatus, reputation: number): number {
  const tiersGained = BOARD_STATUS_RANK[newStatus] - BOARD_STATUS_RANK[prevStatus];
  if (tiersGained <= 0) return 0;
  return Math.round(tiersGained * BOARD_UPGRADE_BONUS_PER_TIER * (1 + reputation / 20));
}
