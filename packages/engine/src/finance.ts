/**
 * 구단 재정: 시즌 수입/지출 정산 (economy.md 4장).
 * 단위: 만원.
 */
import type { Club } from './types.js';

export interface SeasonFinanceReport {
  income: { tv: number; matchday: number; sponsor: number; prize: number; total: number };
  expense: { wages: number; operations: number; total: number };
  net: number;
}

/** 리그 최종 순위(0-index)별 상금. 상위일수록 많고, 우승 보너스. */
export function leaguePrize(position: number, nClubs: number): number {
  const rankPrize = Math.max(0, nClubs - position) * 5_000; // 순위 1계단 = 5,000만원
  const championBonus = position === 0 ? 50_000 : 0;        // 우승 +5억
  return rankPrize + championBonus;
}

/**
 * 시즌 재정 정산.
 * @param finalPosition 리그 최종 순위 (0-index).
 * @param nClubs 리그 구단 수.
 * @param homeGames 홈 경기 수 (기본: nClubs - 1, 더블 라운드로빈 한 시즌 홈경기).
 */
export function settleSeason(
  club: Club,
  finalPosition: number,
  nClubs: number,
  homeGames = nClubs - 1,
): SeasonFinanceReport {
  const rep = club.finance.reputation;

  // 수입
  const tv = rep * 100_000;                         // 중계 분배
  const matchday = homeGames * rep * 5_000;         // 입장 수입
  const sponsor = Math.round(Math.pow(rep, 1.5) * 8_000);
  const prize = leaguePrize(finalPosition, nClubs);
  const incomeTotal = tv + matchday + sponsor + prize;

  // 지출
  const wages = club.players.reduce((s, p) => s + p.wage, 0) * 52;
  const operations = rep * 8_000;
  const expenseTotal = wages + operations;

  const net = incomeTotal - expenseTotal;
  club.finance.balance += net;

  return {
    income: { tv, matchday, sponsor, prize, total: incomeTotal },
    expense: { wages, operations, total: expenseTotal },
    net,
  };
}
