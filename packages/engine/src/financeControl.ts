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
  return { sold, raised };
}
