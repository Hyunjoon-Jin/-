/**
 * 재정 통제 (임금 지속가능성 · 파산 방지).
 * 자금이 음수인 구단은 재정 위기로 고가 선수를 강제 매각해 현금을 확보한다
 * (파이낸셜 페어플레이). 무한 적자 누적을 막고, 성적/경영 실패에 대가를 부여한다.
 */
import type { Club, Player } from './types.js';
import { marketValue } from './valuation.js';
import { MIN_SQUAD } from './transferActions.js';

/** 강제 매각 회수율 (급매 할인). */
const FIRE_SALE_RATIO = 0.85;

/** 지속가능한 연간 임금 예산 추정 (평판 기반). 이보다 크면 임금 과다. */
export function wageBudget(club: Club): number {
  // settleSeason 수입 구조의 임금 감당 가능분 근사(평판 비례 + 균등분).
  return 40_000 + club.finance.reputation * 90_000;
}

/** 연간 임금 총액 (만원). */
export function annualWageBill(club: Club): number {
  return club.players.reduce((s, p) => s + p.wage, 0) * 52;
}

/** 재정 위기 여부 (자금 음수). */
export function inFinancialCrisis(club: Club): boolean {
  return club.finance.balance < 0;
}

export interface FireSaleResult {
  sold: Player[];
  raised: number;
}

/**
 * 재정 위기 해소: 자금이 0 이상이 될 때까지 최고가 선수부터 매각(급매).
 * 최소 스쿼드 인원은 유지. 구단 객체를 직접 변경한다.
 */
export function enforceFinancialFairPlay(club: Club): FireSaleResult {
  const sold: Player[] = [];
  let raised = 0;
  while (club.finance.balance < 0 && club.players.length > MIN_SQUAD) {
    const best = club.players.reduce((a, b) => (marketValue(a) >= marketValue(b) ? a : b));
    const cash = Math.round(marketValue(best) * FIRE_SALE_RATIO);
    club.finance.balance += cash;
    club.finance.transferBudget += cash;
    club.players = club.players.filter((p) => p.id !== best.id);
    sold.push(best);
    raised += cash;
    if (cash <= 0) break; // 가치 0 선수만 남으면 중단
  }
  // 매각으로도 회복이 안 되면(스쿼드 하한·자산 소진) 남은 선수단 임금을 긴급 삭감해
  // 다음 시즌부터라도 재정이 개선되도록 한다 — 영구 파산 상태로 남는 것을 막는 최후 수단.
  if (club.finance.balance < 0) {
    for (const p of club.players) p.wage = Math.round(p.wage * 0.85);
  }
  return { sold, raised };
}

/**
 * 파이낸셜 페어플레이 단계적 절차(고도화 항목21) — 자금이 음수라고 바로 선수를
 * 강제 매각하는 대신, 연속 적자 시즌 수에 따라 경고 → 제재 → 강제매각 순으로 점점
 * 무거운 조치를 적용한다. 흑자로 돌아서면 스트릭이 즉시 리셋돼 다시 1단계부터 시작한다.
 */
export type FfpStage = 'ok' | 'warning' | 'sanction' | 'forcedSale';

/** 제재 단계에서 적용되는 임금 삭감 비율(강제매각 단계의 0.85배보다 완만하다). */
const FFP_SANCTION_WAGE_CUT = 0.9;

export interface FinancialControlResult {
  stage: FfpStage;
  sold: Player[];
  raised: number;
  /** 갱신된 연속 적자 시즌 수(위기가 아니면 0). */
  crisisStreak: number;
}

/**
 * 시즌 종료 시 재정 상태에 따른 단계적 조치를 적용한다(franchise.ts에서 매 시즌 호출).
 * 1시즌째 적자: 경고(이적 예산 동결). 2시즌째 연속 적자: 제재(예산 동결 + 임금 소폭
 * 삭감). 3시즌째 이상 연속 적자: 강제매각(enforceFinancialFairPlay, 기존 로직).
 */
export function applyFinancialControl(club: Club): FinancialControlResult {
  if (!inFinancialCrisis(club)) {
    club.finance.financialCrisisStreak = 0;
    return { stage: 'ok', sold: [], raised: 0, crisisStreak: 0 };
  }
  const crisisStreak = (club.finance.financialCrisisStreak ?? 0) + 1;
  club.finance.financialCrisisStreak = crisisStreak;

  if (crisisStreak === 1) {
    club.finance.transferBudget = 0;
    return { stage: 'warning', sold: [], raised: 0, crisisStreak };
  }
  if (crisisStreak === 2) {
    club.finance.transferBudget = 0;
    for (const p of club.players) p.wage = Math.round(p.wage * FFP_SANCTION_WAGE_CUT);
    return { stage: 'sanction', sold: [], raised: 0, crisisStreak };
  }
  const { sold, raised } = enforceFinancialFairPlay(club);
  return { stage: 'forcedSale', sold, raised, crisisStreak };
}
