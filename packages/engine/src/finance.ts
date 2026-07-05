/**
 * 구단 재정: 시즌 수입/지출 정산 (economy.md 4장).
 * 단위: 만원.
 */
import type { Club } from './types.js';
import type { Rng } from './rng.js';
import { clamp } from './math.js';

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
 * 매치데이 수익의 폼 보정 계수 — 최근 폼이 좋을수록(승점 비율↑) 관중이 몰려 수익이 늘고,
 * 나쁠수록(연패 등) 관중이 줄어 수익이 준다. ratio는 0(전패)~1(전승) 승점 비율.
 * 폼 정보가 없으면(하위 호환 — 이전 호출부는 시즌 결과를 넘기지 않음) 보정 없음(1.0).
 */
export function attendanceFormFactor(recentFormRatio?: number): number {
  if (recentFormRatio === undefined) return 1;
  return clamp(0.7 + recentFormRatio * 0.6, 0.7, 1.3);
}

/** 스타디움 증축 최대 단계. */
export const STADIUM_MAX = 10;
/** 증축 1단계당 매치데이 수익 상한 가산치(레벨10 = +50%). */
const STADIUM_MATCHDAY_BONUS_PER_LEVEL = 0.05;

/** 스타디움 증축 단계 → 매치데이 수익 배율(1.0~1.5). */
export function stadiumMatchdayMultiplier(stadiumLevel = 0): number {
  return 1 + clamp(stadiumLevel, 0, STADIUM_MAX) * STADIUM_MATCHDAY_BONUS_PER_LEVEL;
}

/** 다음 단계로 증축하는 비용(만원) — 레벨이 오를수록 가파르게 증가해 여러 시즌에 걸쳐
 *  회수하는 자본 투자 성격을 띤다. */
export function stadiumUpgradeCost(currentLevel: number): number {
  return (currentLevel + 1) * (currentLevel + 1) * 40_000;
}

export interface StadiumUpgradeResult { ok: boolean; cost?: number; newLevel?: number; reason?: string }

/** 스타디움 한 단계 증축. 구단 객체를 직접 변경한다(보유 자금에서 즉시 차감). */
export function upgradeStadium(club: Club): StadiumUpgradeResult {
  const level = club.finance.stadiumLevel ?? 0;
  if (level >= STADIUM_MAX) return { ok: false, reason: `이미 최대 규모(레벨 ${STADIUM_MAX})입니다.` };
  const cost = stadiumUpgradeCost(level);
  if (club.finance.balance < cost) return { ok: false, reason: '보유 자금이 부족합니다.' };
  club.finance.balance -= cost;
  club.finance.stadiumLevel = level + 1;
  return { ok: true, cost, newLevel: level + 1 };
}

/** 아카데미 시설 증축 최대 단계. */
export const ACADEMY_MAX = 10;
/** 증축 1단계당 유스 인테이크 잠재력 가산치. */
const ACADEMY_POTENTIAL_BONUS_PER_LEVEL = 3;

/** 아카데미 시설 등급 → 유스 인테이크 잠재력 가산 보너스. 유스 스태프(인력)의
 *  effectiveYouth 보너스와는 별개로, 시설(자본재) 투자분만큼 추가로 더해진다. */
export function academyPotentialBonus(academyLevel = 0): number {
  return clamp(academyLevel, 0, ACADEMY_MAX) * ACADEMY_POTENTIAL_BONUS_PER_LEVEL;
}

/** 다음 단계로 증축하는 비용(만원) — 스타디움과 같은 자본 투자 곡선. */
export function academyUpgradeCost(currentLevel: number): number {
  return (currentLevel + 1) * (currentLevel + 1) * 30_000;
}

export interface AcademyUpgradeResult { ok: boolean; cost?: number; newLevel?: number; reason?: string }

/** 아카데미 시설 한 단계 증축. 구단 객체를 직접 변경한다(보유 자금에서 즉시 차감). */
export function upgradeAcademy(club: Club): AcademyUpgradeResult {
  const level = club.finance.academyLevel ?? 0;
  if (level >= ACADEMY_MAX) return { ok: false, reason: `이미 최대 시설(레벨 ${ACADEMY_MAX})입니다.` };
  const cost = academyUpgradeCost(level);
  if (club.finance.balance < cost) return { ok: false, reason: '보유 자금이 부족합니다.' };
  club.finance.balance -= cost;
  club.finance.academyLevel = level + 1;
  return { ok: true, cost, newLevel: level + 1 };
}

/**
 * 시즌 재정 정산.
 * @param finalPosition 리그 최종 순위 (0-index).
 * @param nClubs 리그 구단 수.
 * @param homeGames 홈 경기 수 (기본: nClubs - 1, 더블 라운드로빈 한 시즌 홈경기).
 * @param recentFormRatio 최근 폼 승점 비율(0~1) — 매치데이 수익에 반영(생략 시 보정 없음).
 */
export function settleSeason(
  club: Club,
  finalPosition: number,
  nClubs: number,
  homeGames = nClubs - 1,
  recentFormRatio?: number,
): SeasonFinanceReport {
  const rep = club.finance.reputation;

  // 수입 (중계는 균등 분배분 + 평판 비례분 → 약팀도 최소 보장)
  const tv = 45_000 + rep * 48_000;
  const matchday = Math.round(
    homeGames * rep * 5_000 * attendanceFormFactor(recentFormRatio) * stadiumMatchdayMultiplier(club.finance.stadiumLevel),
  ); // 입장 수입
  const sponsor = Math.round(Math.pow(rep, 1.5) * 5_500);
  const prize = leaguePrize(finalPosition, nClubs);
  const incomeTotal = tv + matchday + sponsor + prize;

  // 지출 (인건비 + 운영 + 스태프 급여)
  const wages = club.players.reduce((s, p) => s + p.wage, 0) * 52;
  const staffWage =
    (club.staff.coaching + club.staff.medical + club.staff.scouting + club.staff.youth) * 600;
  const operations = rep * 8_000 + staffWage;
  const expenseTotal = wages + operations;

  const net = incomeTotal - expenseTotal;
  club.finance.balance += net;
  // 이적 예산을 현재 자금 규모에 맞춰 재조정 — 생성 시 최초 공식(잔고의 40%)과 동일한
  // 비율로, 성공해서 잔고가 불어난 구단은 이적 예산도 함께 커진다. 매각으로 이미
  // 예산이 이 기준보다 높다면 그대로 유지(줄어들지 않음).
  club.finance.transferBudget = Math.max(
    club.finance.transferBudget,
    Math.round(Math.max(0, club.finance.balance) * 0.4),
  );

  return {
    income: { tv, matchday, sponsor, prize, total: incomeTotal },
    expense: { wages, operations, total: expenseTotal },
    net,
  };
}

/**
 * 스폰서 보너스 목표 — 시즌 시작 시 확률적으로 부여되는 별도의 현금 인센티브
 * (demands.ts의 이사회 특별 요구와 같은 보상/페널티 패턴을 재사용하되, 성패가
 * 신뢰도가 아닌 일시불 보너스로 이어진다는 점이 다르다).
 */
export type SponsorGoalKind = 'top4Finish' | 'cupWon';

export const SPONSOR_GOAL_LABEL: Record<SponsorGoalKind, string> = {
  top4Finish: '리그 4위 이내로 시즌을 마칠 것',
  cupWon: '컵대회에서 우승할 것',
};

export interface SponsorGoal {
  kind: SponsorGoalKind;
  /** 달성 시 지급되는 일시불 보너스(만원). */
  bonus: number;
}

/** 시즌마다 스폰서 보너스 목표가 부여될 확률(나머지는 목표 없이 기본 스폰서 수입만). */
const SPONSOR_GOAL_CHANCE = 0.6;
/** 보너스 기본액(만원) — 평판 1당 가산분이 더해진다. */
const SPONSOR_BONUS_BASE = 8_000;
const SPONSOR_BONUS_PER_REP = 1_500;

/** 시즌 시작 시 스폰서 보너스 목표 생성(선택적) — 평판이 높을수록 보너스도 커진다. */
export function generateSponsorGoal(rng: Rng, reputation: number): SponsorGoal | null {
  if (rng.next() >= SPONSOR_GOAL_CHANCE) return null;
  const kinds: SponsorGoalKind[] = ['top4Finish', 'cupWon'];
  const kind = kinds[rng.int(0, kinds.length - 1)]!;
  const bonus = SPONSOR_BONUS_BASE + reputation * SPONSOR_BONUS_PER_REP;
  return { kind, bonus };
}

export interface SponsorGoalResult {
  top4Finish: boolean;
  cupWon: boolean;
}

/** 스폰서 보너스 목표 달성 여부. */
export function evaluateSponsorGoal(goal: SponsorGoal, res: SponsorGoalResult): boolean {
  switch (goal.kind) {
    case 'top4Finish': return res.top4Finish;
    case 'cupWon': return res.cupWon;
  }
}
