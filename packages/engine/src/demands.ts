/**
 * 이사회 특별 요구 — 신뢰도 시스템 위의 시즌 도전 과제.
 * 매 시즌 시작 시 구단 상황에 따라 검증 가능한 요구가 부여되고,
 * 시즌 종료 시 달성 여부로 신뢰도를 가감한다(board.ts와 연동).
 */
import type { Rng } from './rng.js';
import { clamp } from './math.js';
import type { BoardPersona, BoardStyle } from './types.js';

export type DemandKind = 'cutWages' | 'winCup' | 'clubTopScorer' | 'topHalfFinish';

export interface BoardDemand {
  kind: DemandKind;
  /** 달성 시 신뢰도 가산. */
  reward: number;
  /** 실패 시 신뢰도 감산(양수). */
  penalty: number;
}

export const DEMAND_LABEL: Record<DemandKind, string> = {
  cutWages: '임금 총액을 예산 이내로 줄일 것',
  winCup: '컵대회에서 우승할 것',
  clubTopScorer: '리그 득점왕을 배출할 것',
  topHalfFinish: '리그 상위 절반 안에서 시즌을 마칠 것',
};

/** 요구 생성 컨텍스트. */
export interface DemandContext {
  /** 현재 임금 총액이 예산을 초과 중인가. */
  overWages: boolean;
  /** 감독 계약 누적치(장기 계약을 맺을수록 증가). 이사회 기대치를 함께 높인다. */
  ambition?: number;
}

/** 이사회 재정 성향에 따른 요구 빈도/강도 가감 — 공격적인 보드는 더 자주, 더 세게 요구하고
 *  보수적인 보드는 뒤로 물러나 있는다. */
const STYLE_SKIP_ADJUST: Record<BoardStyle, number> = { conservative: 0.15, aggressive: -0.15 };
const STYLE_MAGNITUDE_MUL: Record<BoardStyle, number> = { conservative: 0.8, aggressive: 1.3 };

/**
 * 시즌 요구 생성. 임금 초과 시 감축을 강하게 요구(실패 벌점 큼),
 * 아니면 일정 확률로 도전 과제(성공 보상 큼) 또는 요구 없음.
 * ambition(장기 계약 누적치)이 높을수록 요구가 나올 확률과 보상/벌점 폭이 함께 커진다
 * — 장기 프로젝트를 약속한 만큼 이사회도 더 자주, 더 강하게 결과를 요구한다.
 * boardStyle(이사회 재정 성향)이 주어지면 빈도·강도가 구단마다 다르게 반영된다(생략 시
 * 하위 호환 — 기존과 동일하게 동작).
 */
export function generateDemand(ctx: DemandContext, rng: Rng, boardStyle?: BoardStyle): BoardDemand | null {
  // ambition 기여분에 상한을 둔다 — board.ts의 confidenceDelta(시즌 성적 변동)가 이미
  // ±40/38로 명시적으로 클램프돼 있는데, 여기 보상/벌점이 무제한으로 커지면 장기 계약을
  // 여러 번 맺은 뒤 요구 하나로 신뢰도가 한 시즌 만에 100→0까지 급락할 수 있어
  // "시즌당 변동폭을 제한한다"는 원래 의도를 무력화한다.
  const ambition = clamp(ctx.ambition ?? 0, 0, 10);
  const magnitudeMul = boardStyle ? STYLE_MAGNITUDE_MUL[boardStyle] : 1;
  if (ctx.overWages) {
    return { kind: 'cutWages', reward: 8, penalty: Math.round((10 + ambition * 2) * magnitudeMul) };
  }
  // 임금이 건전하면 일정 확률로 상향 도전 과제, 아니면 요구 없음(ambition이 높을수록 스킵 확률↓).
  const skipAdjust = boardStyle ? STYLE_SKIP_ADJUST[boardStyle] : 0;
  const skipChance = clamp(0.55 - ambition * 0.1 + skipAdjust, 0.15, 0.9);
  if (rng.next() < skipChance) return null;
  const kinds: DemandKind[] = ['winCup', 'clubTopScorer', 'topHalfFinish'];
  const kind = kinds[rng.int(0, kinds.length - 1)]!;
  return {
    kind,
    reward: Math.round((12 + ambition * 2) * magnitudeMul),
    penalty: Math.round((4 + ambition * 2) * magnitudeMul),
  };
}

/** 요구 평가 입력(시즌 결과). */
export interface DemandResult {
  wageUnderBudget: boolean;
  cupWon: boolean;
  clubTopScorer: boolean;
  /** 리그 최종 순위가 소속 부(division) 상위 절반 안에 들었는가. */
  topHalfFinish: boolean;
}

/** 요구 달성 여부. */
export function evaluateDemand(demand: BoardDemand, res: DemandResult): boolean {
  switch (demand.kind) {
    case 'cutWages': return res.wageUnderBudget;
    case 'winCup': return res.cupWon;
    case 'clubTopScorer': return res.clubTopScorer;
    case 'topHalfFinish': return res.topHalfFinish;
  }
}

/** 요구 달성/실패에 따른 신뢰도 변화량(+reward / −penalty). */
export function demandConfidence(demand: BoardDemand, met: boolean): number {
  return met ? demand.reward : -demand.penalty;
}

// ── 이사회 요구 재협상(신규 개선 항목 22) ────────────────────

/** 재협상 시 즉시 지불하는 신뢰도 비용(성공 여부와 무관하게, 조급한 이사회의 거절 제외). */
export const RENEGOTIATE_BASE_COST = 5;
/** 공격적 성향 이사회는 재협상에도 더 비싼 대가를 요구한다. */
const RENEGOTIATE_STYLE_COST_MUL: Record<BoardStyle, number> = { conservative: 1, aggressive: 1.4 };
/** 조급한 이사회가 재협상 요청 자체를 거절할 확률(이 경우 비용도 들지 않는다). */
export const RENEGOTIATE_IMPATIENT_REFUSE_CHANCE = 0.4;
/** 재협상 성공 시 보상/벌점이 이 배율로 줄어든다(요구 강도 완화). */
export const RENEGOTIATE_REDUCTION = 0.5;

export interface RenegotiateResult {
  ok: boolean;
  reason?: string;
  /** 성공 시 완화된 새 요구. */
  newDemand?: BoardDemand;
  /** 즉시 지불한 신뢰도 비용(거절당하면 0). */
  confidenceCost: number;
}

/**
 * 이사회 특별 요구 재협상 요청 — 감독이 먼저 나서서 요구 강도(보상·벌점 양쪽)를
 * 낮춰달라고 요청한다. 조급한(impatient) 이사회는 확률적으로 아예 거절할 수 있고,
 * 공격적(aggressive) 성향 이사회는 응해주더라도 더 비싼 신뢰도 비용을 매긴다.
 * 시즌당 1회로 제한하는 것은 호출부(앱)의 책임이다.
 */
export function renegotiateDemand(demand: BoardDemand, rng: Rng, persona?: BoardPersona): RenegotiateResult {
  if (persona?.patience === 'impatient' && rng.next() < RENEGOTIATE_IMPATIENT_REFUSE_CHANCE) {
    return { ok: false, reason: '조급한 이사회가 재협상 요청을 거절했습니다.', confidenceCost: 0 };
  }
  const costMul = persona?.style ? RENEGOTIATE_STYLE_COST_MUL[persona.style] : 1;
  const confidenceCost = Math.round(RENEGOTIATE_BASE_COST * costMul);
  const newDemand: BoardDemand = {
    kind: demand.kind,
    reward: Math.round(demand.reward * RENEGOTIATE_REDUCTION),
    penalty: Math.round(demand.penalty * RENEGOTIATE_REDUCTION),
  };
  return { ok: true, newDemand, confidenceCost };
}
