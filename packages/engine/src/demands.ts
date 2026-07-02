/**
 * 이사회 특별 요구 — 신뢰도 시스템 위의 시즌 도전 과제.
 * 매 시즌 시작 시 구단 상황에 따라 검증 가능한 요구가 부여되고,
 * 시즌 종료 시 달성 여부로 신뢰도를 가감한다(board.ts와 연동).
 */
import type { Rng } from './rng.js';

export type DemandKind = 'cutWages' | 'winCup' | 'clubTopScorer';

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
};

/** 요구 생성 컨텍스트. */
export interface DemandContext {
  /** 현재 임금 총액이 예산을 초과 중인가. */
  overWages: boolean;
  /** 감독 계약 누적치(장기 계약을 맺을수록 증가). 이사회 기대치를 함께 높인다. */
  ambition?: number;
}

/**
 * 시즌 요구 생성. 임금 초과 시 감축을 강하게 요구(실패 벌점 큼),
 * 아니면 일정 확률로 도전 과제(성공 보상 큼) 또는 요구 없음.
 * ambition(장기 계약 누적치)이 높을수록 요구가 나올 확률과 보상/벌점 폭이 함께 커진다
 * — 장기 프로젝트를 약속한 만큼 이사회도 더 자주, 더 강하게 결과를 요구한다.
 */
export function generateDemand(ctx: DemandContext, rng: Rng): BoardDemand | null {
  const ambition = ctx.ambition ?? 0;
  if (ctx.overWages) return { kind: 'cutWages', reward: 8, penalty: 10 + ambition * 2 };
  // 임금이 건전하면 일정 확률로 상향 도전 과제, 아니면 요구 없음(ambition이 높을수록 스킵 확률↓).
  const skipChance = Math.max(0.15, 0.55 - ambition * 0.1);
  if (rng.next() < skipChance) return null;
  const kind: DemandKind = rng.roll(0.5) ? 'winCup' : 'clubTopScorer';
  return { kind, reward: 12 + ambition * 2, penalty: 4 + ambition * 2 };
}

/** 요구 평가 입력(시즌 결과). */
export interface DemandResult {
  wageUnderBudget: boolean;
  cupWon: boolean;
  clubTopScorer: boolean;
}

/** 요구 달성 여부. */
export function evaluateDemand(demand: BoardDemand, res: DemandResult): boolean {
  switch (demand.kind) {
    case 'cutWages': return res.wageUnderBudget;
    case 'winCup': return res.cupWon;
    case 'clubTopScorer': return res.clubTopScorer;
  }
}

/** 요구 달성/실패에 따른 신뢰도 변화량(+reward / −penalty). */
export function demandConfidence(demand: BoardDemand, met: boolean): number {
  return met ? demand.reward : -demand.penalty;
}
