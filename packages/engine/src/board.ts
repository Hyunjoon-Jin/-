/**
 * 이사회 신뢰도 — 실패 조건(경질 압박).
 * 시즌 성적이 보드진 목표(리그 순위) 대비 어떤지, 승강·재정이 어땠는지로
 * 신뢰도가 오르내린다. 바닥나면 경질(게임 오버)로 이어진다.
 * 순수 로직만 두어 헤드리스로 검증 가능.
 */
import { clamp } from './math.js';
import type { BoardPatience, BoardStyle, BoardPersona } from './types.js';
import type { Rng } from './rng.js';

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

/**
 * 장기 프로젝트 보너스(고도화 항목20) — 이사회 목표(objective)를 여러 시즌 연속으로
 * 달성하면("장기 프로젝트가 궤도에 올랐다") 예산 증액 등 특별 보상을 지급한다.
 * 단일 시즌 성과 보상(prize, boardTierUpgradeBonus)과 달리 다년간의 꾸준함에 대한
 * 보상이라, 마일스톤에 처음 도달한 시즌에만 일회성으로 지급된다.
 */
export const LONG_TERM_PROJECT_MILESTONES = [3, 5, 7, 10];
const LONG_TERM_PROJECT_BONUS_PER_MILESTONE = 15_000;

/** 목표 달성 연속 스트릭이 이번 시즌에 새로 마일스톤을 넘었으면 그 값, 아니면 undefined
 *  (이미 지난 시즌에 넘은 마일스톤을 다시 보상하지 않기 위함 — crossedThresholds와 동일 패턴). */
export function crossedLongTermProjectMilestone(prevStreak: number, newStreak: number): number | undefined {
  return LONG_TERM_PROJECT_MILESTONES.find((m) => prevStreak < m && newStreak >= m);
}

/** 마일스톤 달성 시 지급되는 일회성 보너스 — 평판이 높을수록(더 큰 프로젝트일수록) 가산. */
export function longTermProjectBonus(milestone: number, reputation: number): number {
  return Math.round(milestone * LONG_TERM_PROJECT_BONUS_PER_MILESTONE * (1 + reputation / 20));
}

/**
 * 대담한 목표 공개 선언(신규 개선 항목 25) — 시즌 시작 전(첫 경기 전), 이사회 목표
 * (objective)보다 더 높은 순위를 언론에 공개 선언할 수 있다. 실제로 그 목표까지
 * 달성하면 초과 달성 이상의 추가 신뢰 보너스가 붙고, 반대로 원래 목표조차 놓치면
 * 공개 선언에 대한 추가 페널티가 붙는다. 목표는 넘었지만 선언한 목표엔 못 미친
 * 경우엔 선언하지 않은 것과 동일(추가 효과 없음) — 순전히 상방과 하방이 비대칭인
 * 하이 리스크·하이 리턴 도박이다.
 */
export const BOLD_PREDICTION_MARGIN = 3;
export const BOLD_PREDICTION_BONUS_CONFIDENCE = 12;
export const BOLD_PREDICTION_PENALTY_CONFIDENCE = 14;

/** 선언 가능한 목표 순위 — 이사회 목표보다 BOLD_PREDICTION_MARGIN만큼 더 높다(최소 1위). */
export function boldPredictionTarget(objective: number): number {
  return Math.max(1, objective - BOLD_PREDICTION_MARGIN);
}

export interface BoldPredictionResult {
  declaredTarget: number;
  /** 선언한 목표까지 실제로 달성했는지. */
  met: boolean;
  /** 선언한 목표는커녕 원래 이사회 목표(objective)조차 놓쳤는지. */
  missedObjective: boolean;
  /** boardConfidence 계산에 그대로 더해지는 가감치(+BOLD_PREDICTION_BONUS_CONFIDENCE /
   *  -BOLD_PREDICTION_PENALTY_CONFIDENCE / 0). */
  confidenceAdjust: number;
}

/** 대담한 목표 선언 결과 평가. finalPosition은 1-index 리그 최종 순위. */
export function evaluateBoldPrediction(
  declaredTarget: number,
  finalPosition: number,
  objective: number,
): BoldPredictionResult {
  const met = finalPosition <= declaredTarget;
  const missedObjective = finalPosition > objective;
  const confidenceAdjust = met
    ? BOLD_PREDICTION_BONUS_CONFIDENCE
    : missedObjective ? -BOLD_PREDICTION_PENALTY_CONFIDENCE : 0;
  return { declaredTarget, met, missedObjective, confidenceAdjust };
}

/**
 * 회장 교체 이벤트(고도화 항목17) — 이사회 페르소나(patience/style)는 지금까지 구단
 * 생성 시 한 번 고정되면 게임이 끝날 때까지 그대로였다. 시즌 종료 시 저확률로 회장이
 * 바뀌며 새 이사회 성향이 정해지는 서사를 추가해, 오래 플레이해도 이사회 대응 전략이
 * 고정되지 않게 한다.
 */
export const BOARD_PERSONA_CHANGE_CHANCE = 0.06;

const ALL_BOARD_PERSONAS: BoardPersona[] = [
  { patience: 'patient', style: 'conservative' },
  { patience: 'patient', style: 'aggressive' },
  { patience: 'impatient', style: 'conservative' },
  { patience: 'impatient', style: 'aggressive' },
];

/**
 * 시즌 종료 시 저확률로 회장이 교체되며 이사회 성향이 새로 정해진다. "교체"라는
 * 서사가 성립하려면 실제로 달라져야 하므로, 현재와 다른 조합 중에서만 뽑는다.
 * 발생하지 않으면(대부분의 시즌) undefined.
 */
export function maybeChangeBoardPersona(current: BoardPersona, rng: Rng): BoardPersona | undefined {
  if (!rng.roll(BOARD_PERSONA_CHANGE_CHANCE)) return undefined;
  const candidates = ALL_BOARD_PERSONAS.filter((p) => (
    p.patience !== current.patience || p.style !== current.style
  ));
  return candidates[rng.int(0, candidates.length - 1)];
}
