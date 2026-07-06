/**
 * 구단 재정: 시즌 수입/지출 정산 (economy.md 4장).
 * 단위: 만원.
 */
import type { Club, TicketPriceTier } from './types.js';
import type { Rng } from './rng.js';
import { clamp } from './math.js';

export interface SeasonFinanceReport {
  income: { tv: number; matchday: number; sponsor: number; prize: number; total: number };
  expense: { wages: number; operations: number; total: number };
  net: number;
  /** 라이벌전(더비) 홈 경기 매치데이 프리미엄으로 얻은 추가 수익(신규 개선 항목 23,
   *  matchday에 이미 합산돼 있음 — 얼마나 붙었는지 확인용). 라이벌전 홈 경기가 없었으면 undefined. */
  rivalBonus?: number;
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

/** 훈련장(피지컬 트레이닝) 시설 증축 최대 단계(신규 개선 항목 21). */
export const TRAINING_GROUND_MAX = 10;
/** 증축 1단계당 부상 확률 배율 감소치(레벨10 = -20%p, 즉 0.8배). */
const TRAINING_GROUND_INJURY_REDUCTION_PER_LEVEL = 0.02;

/** 훈련장 시설 등급 → 부상 확률 배율(1.0~0.8, 레벨이 오를수록 낮아짐). 의료 스태프
 *  (인력)의 effectiveMedical 보정과는 별개로, 시설(자본재) 투자분만큼 추가로 곱해진다. */
export function trainingGroundInjuryFactor(trainingGroundLevel = 0): number {
  return 1 - clamp(trainingGroundLevel, 0, TRAINING_GROUND_MAX) * TRAINING_GROUND_INJURY_REDUCTION_PER_LEVEL;
}

/** 다음 단계로 증축하는 비용(만원) — 다른 시설과 같은 자본 투자 곡선. */
export function trainingGroundUpgradeCost(currentLevel: number): number {
  return (currentLevel + 1) * (currentLevel + 1) * 30_000;
}

export interface TrainingGroundUpgradeResult { ok: boolean; cost?: number; newLevel?: number; reason?: string }

/** 훈련장 시설 한 단계 증축. 구단 객체를 직접 변경한다(보유 자금에서 즉시 차감). */
export function upgradeTrainingGround(club: Club): TrainingGroundUpgradeResult {
  const level = club.finance.trainingGroundLevel ?? 0;
  if (level >= TRAINING_GROUND_MAX) return { ok: false, reason: `이미 최대 시설(레벨 ${TRAINING_GROUND_MAX})입니다.` };
  const cost = trainingGroundUpgradeCost(level);
  if (club.finance.balance < cost) return { ok: false, reason: '보유 자금이 부족합니다.' };
  club.finance.balance -= cost;
  club.finance.trainingGroundLevel = level + 1;
  return { ok: true, cost, newLevel: level + 1 };
}

/** 라이벌전(더비) 홈 경기 매치데이 프리미엄 배율(신규 개선 항목 23) — 평소보다 열기가
 *  뜨거워 관중이 몰려, 그 경기만큼은 입장 수입이 이 배율만큼 더 오른다. */
export const RIVAL_MATCHDAY_PREMIUM = 1.4;

/** 중계권료 순위 배당 계수(고도화 항목16) — 상위권 경기에 시청 수요가 몰린다는 가정으로,
 *  평판 비례분과 별개로 최종 순위(0-index, 낮을수록 상위)에 비례해 추가 배당한다.
 *  꼴찌는 가산 없음, 1위는 최대 가산(평판 비례분의 배율로 적용). */
const TV_RANK_BONUS_PER_REP = 12_000;

/** 중계권료 순위 배당(고도화 항목16) — 균등 분배분·평판 비례분(tv 기본식)과 별개로,
 *  이번 시즌 최종 순위가 높을수록(1위에 가까울수록) 시청률 배당이 추가로 붙는다. */
function broadcastRankBonus(finalPosition: number, nClubs: number, rep: number): number {
  const rankRatio = nClubs > 1 ? 1 - finalPosition / (nClubs - 1) : 1;
  return Math.round(clamp(rankRatio, 0, 1) * rep * TV_RANK_BONUS_PER_REP);
}

/** 티켓 가격 등급별 매치데이 수익 배율(고도화 항목18) — 비쌀수록 수익은 늘지만 팬
 *  만족도는 깎인다(fanSatisfactionDelta 참고). 'normal'은 기존과 완전히 동일(1.0배). */
export const TICKET_PRICE_MATCHDAY_MULTIPLIER: Record<TicketPriceTier, number> = {
  low: 0.85, normal: 1.0, high: 1.2,
};

/** 팬 만족도가 문턱 미만으로 떨어져 시위가 발생한 다음 시즌, 매치데이 수익에 붙는
 *  일회성 페널티 배율(고도화 항목18) — 정산 후 자동으로 꺼진다. */
export const FAN_PROTEST_MATCHDAY_PENALTY = 0.85;

/**
 * 시즌 재정 정산.
 * @param finalPosition 리그 최종 순위 (0-index).
 * @param nClubs 리그 구단 수.
 * @param homeGames 홈 경기 수 (기본: nClubs - 1, 더블 라운드로빈 한 시즌 홈경기).
 * @param recentFormRatio 최근 폼 승점 비율(0~1) — 매치데이 수익에 반영(생략 시 보정 없음).
 * @param rivalHomeMatches 이번 시즌 라이벌 상대로 치른 홈 경기 수(보통 0 또는 1) — 그만큼
 *   매치데이 수익에 RIVAL_MATCHDAY_PREMIUM 프리미엄이 추가로 붙는다(신규 개선 항목 23).
 */
export function settleSeason(
  club: Club,
  finalPosition: number,
  nClubs: number,
  homeGames = nClubs - 1,
  recentFormRatio?: number,
  rivalHomeMatches = 0,
): SeasonFinanceReport {
  const rep = club.finance.reputation;

  // 수입 (중계는 균등 분배분 + 평판 비례분 → 약팀도 최소 보장. 순위 배당(고도화 항목16)은
  // 시청률이 상위권 경기에 몰린다는 가정으로 그 위에 추가로 붙는다.)
  const tv = 45_000 + rep * 48_000 + broadcastRankBonus(finalPosition, nClubs, rep);
  const ticketMul = TICKET_PRICE_MATCHDAY_MULTIPLIER[club.finance.ticketPriceTier ?? 'normal'];
  // 지난 시즌 팬 만족도가 바닥나 시위가 있었다면(고도화 항목18) 이번 정산에서 한 번만 페널티.
  const protestMul = club.finance.fanProtestActive ? FAN_PROTEST_MATCHDAY_PENALTY : 1;
  club.finance.fanProtestActive = false;
  const perGameMatchday =
    rep * 5_000 * attendanceFormFactor(recentFormRatio) * stadiumMatchdayMultiplier(club.finance.stadiumLevel)
    * ticketMul * protestMul;
  const rivalBonus = Math.round(perGameMatchday * clamp(rivalHomeMatches, 0, homeGames) * (RIVAL_MATCHDAY_PREMIUM - 1));
  const matchday = Math.round(perGameMatchday * homeGames) + rivalBonus; // 입장 수입(라이벌전 프리미엄 포함)
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
    rivalBonus: rivalBonus > 0 ? rivalBonus : undefined,
  };
}

/**
 * 스폰서 계약(유니폼/스타디움 명명권/소매) — 아래의 성과 기반 시즌 목표 보너스와는 별개로,
 * 한 번 체결하면 성과와 무관하게 정해진 시즌 동안 고정 수익을 매 시즌 보장하는
 * 장기 계약(신규 개선 항목 24, 고도화 항목15로 소매 스폰서 추가 다변화). 체결 시점의
 * 평판(과 스타디움 명명권의 경우 스타디움 규모)에 수익이 고정되므로, 평판이 오르기 전에
 * 미리 체결하면 손해, 오른 뒤 체결하면 이득이라는 타이밍 판단이 생긴다.
 */
export type SponsorContractKind = 'kit' | 'stadiumNaming' | 'sleeve';

export const SPONSOR_CONTRACT_LABEL: Record<SponsorContractKind, string> = {
  kit: '유니폼 스폰서',
  stadiumNaming: '스타디움 명명권',
  sleeve: '소매 스폰서',
};

/** 계약 기간(시즌) — 만료되면 재계약(재체결)이 필요하다. */
export const SPONSOR_CONTRACT_LENGTH_SEASONS = 3;

/** 체결 수수료(에이전트/법무 비용) — 연간 수익의 이 배율만큼 즉시 차감된다. */
export const SPONSOR_CONTRACT_SIGN_FEE_MULTIPLIER = 1.5;

/** 명명권 계약이 가능한 최소 스타디움 증축 단계 — 이름을 붙일 만한 규모는 돼야 한다. */
export const SPONSOR_CONTRACT_STADIUM_MIN_LEVEL = 1;

const SPONSOR_CONTRACT_BASE: Record<SponsorContractKind, number> = {
  kit: 6_000,
  stadiumNaming: 5_000,
  sleeve: 3_000,
};
const SPONSOR_CONTRACT_PER_REP: Record<SponsorContractKind, number> = {
  kit: 900,
  stadiumNaming: 700,
  sleeve: 500,
};

/** 계약 체결 시 시즌당 고정 수익(만원) — 스타디움 명명권은 스타디움 규모만큼 추가로 붙는다. */
export function sponsorContractPayout(kind: SponsorContractKind, reputation: number, stadiumLevel = 0): number {
  const raw = SPONSOR_CONTRACT_BASE[kind] + reputation * SPONSOR_CONTRACT_PER_REP[kind];
  return Math.round(kind === 'stadiumNaming' ? raw * stadiumMatchdayMultiplier(stadiumLevel) : raw);
}

export interface SponsorContract {
  kind: SponsorContractKind;
  seasonsRemaining: number;
  /** 체결 시점에 고정된 시즌당 수익(만원) — 이후 평판이 변해도 갱신 전까지 그대로다. */
  payoutPerSeason: number;
}

export interface SponsorContractSignResult { ok: boolean; reason?: string; cost?: number; contract?: SponsorContract }

/** 스폰서 계약 신규 체결 — 같은 종류의 계약이 이미 진행 중이면 만료 전까지 중복 체결 불가. */
export function signSponsorContract(club: Club, kind: SponsorContractKind): SponsorContractSignResult {
  const existing = club.finance.sponsorContracts ?? [];
  if (existing.some((c) => c.kind === kind)) {
    return { ok: false, reason: `이미 ${SPONSOR_CONTRACT_LABEL[kind]} 계약이 진행 중입니다.` };
  }
  if (kind === 'stadiumNaming' && (club.finance.stadiumLevel ?? 0) < SPONSOR_CONTRACT_STADIUM_MIN_LEVEL) {
    return { ok: false, reason: '스타디움을 먼저 증축해야 명명권 계약을 체결할 수 있습니다.' };
  }
  const payoutPerSeason = sponsorContractPayout(kind, club.finance.reputation, club.finance.stadiumLevel);
  const cost = Math.round(payoutPerSeason * SPONSOR_CONTRACT_SIGN_FEE_MULTIPLIER);
  if (club.finance.balance < cost) return { ok: false, reason: '체결 수수료를 낼 자금이 부족합니다.' };
  club.finance.balance -= cost;
  const contract: SponsorContract = { kind, seasonsRemaining: SPONSOR_CONTRACT_LENGTH_SEASONS, payoutPerSeason };
  club.finance.sponsorContracts = [...existing, contract];
  return { ok: true, cost, contract };
}

export interface SponsorContractTickResult { income: number; expired: SponsorContract[] }

/** 매 시즌 정산 시 호출 — 활성 계약분 수익을 합산하고 잔여 시즌을 차감, 만료된 계약은
 *  목록에서 제거한다(재계약하지 않으면 그 종류의 수익이 끊긴다). */
export function tickSponsorContracts(club: Club): SponsorContractTickResult {
  const contracts = club.finance.sponsorContracts ?? [];
  let income = 0;
  const remaining: SponsorContract[] = [];
  const expired: SponsorContract[] = [];
  for (const c of contracts) {
    income += c.payoutPerSeason;
    const seasonsRemaining = c.seasonsRemaining - 1;
    if (seasonsRemaining > 0) remaining.push({ ...c, seasonsRemaining });
    else expired.push(c);
  }
  club.finance.sponsorContracts = remaining;
  return { income, expired };
}

/**
 * 팬 만족도 미터(고도화 항목18) — 티켓가·성적·영입 소식에 반응하는 팬심 지표.
 * 성적·영입 신호는 리그 순위/목표(1-index)를 다루는 앱 레이어만 알 수 있어, 이 함수는
 * 순수하게 "성과 편차"(양수=초과 달성)를 입력으로 받아 index 기준 혼동을 피한다.
 */
export const FAN_SATISFACTION_DEFAULT = 60;
/** 팬 만족도가 이 미만으로 떨어지면 시위가 발생한다. */
export const FAN_PROTEST_THRESHOLD = 20;

/** 티켓가가 비쌀수록 팬은 부담을 느낀다(매치데이 수익 배율과는 반대 방향 압력). */
const TICKET_PRICE_FAN_DELTA: Record<TicketPriceTier, number> = {
  low: 3, normal: 0, high: -5,
};
/** 신규 영입 1명당 팬 만족도 가산(상한 있음) — 큰 이적 소식에 팬이 들뜬다는 가정. */
const SIGNING_FAN_BONUS_PER_PLAYER = 2;
const SIGNING_FAN_BONUS_MAX = 6;

export interface FanSatisfactionInput {
  /** 목표 대비 성적 편차(양수=초과 달성, 음수=미달) — 1-index 순위 계산은 호출부 책임. */
  performanceDelta: number;
  ticketPriceTier: TicketPriceTier;
  /** 이번 시즌 새로 영입한 선수 수(0 이상). */
  newSignings: number;
}

/** 팬 만족도 변화량(순수 계산, Club을 변경하지 않는다). */
export function fanSatisfactionDelta(input: FanSatisfactionInput): number {
  const perf = clamp(input.performanceDelta * 1.5, -15, 15);
  const price = TICKET_PRICE_FAN_DELTA[input.ticketPriceTier];
  const signings = Math.min(Math.max(input.newSignings, 0) * SIGNING_FAN_BONUS_PER_PLAYER, SIGNING_FAN_BONUS_MAX);
  return Math.round(perf + price + signings);
}

export interface FanSatisfactionResult {
  fanSatisfaction: number;
  delta: number;
  /** 문턱 미만으로 떨어져 시위가 발생했는지 — true면 club.finance.fanProtestActive가
   *  켜져 다음 settleSeason에서 매치데이 페널티가 한 번 적용된다. */
  protest: boolean;
}

/** 팬 만족도 갱신(Club을 직접 변경한다). 시즌 종료 시 한 번 호출한다. */
export function updateFanSatisfaction(club: Club, input: FanSatisfactionInput): FanSatisfactionResult {
  const current = club.finance.fanSatisfaction ?? FAN_SATISFACTION_DEFAULT;
  const delta = fanSatisfactionDelta(input);
  const next = clamp(current + delta, 0, 100);
  club.finance.fanSatisfaction = next;
  const protest = next < FAN_PROTEST_THRESHOLD;
  if (protest) club.finance.fanProtestActive = true;
  return { fanSatisfaction: next, delta, protest };
}

/** 티켓 가격 등급 변경(자유 변경, 비용 없음). */
export function setTicketPriceTier(club: Club, tier: TicketPriceTier): void {
  club.finance.ticketPriceTier = tier;
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

/** 연속 달성 1회당 가산 배율. */
const SPONSOR_STREAK_BONUS_PER_STREAK = 0.1;
/** 이 이상은 더 쌓여도 배율이 늘지 않는다(무한 인플레이션 방지). */
const SPONSOR_STREAK_CAP = 5;

/**
 * 스폰서 보너스 목표를 연속으로 달성할수록 다음 보너스가 커지는 배율(1.0~1.5).
 * streak는 "이번 목표를 달성하기 직전까지의" 연속 달성 횟수(0부터 시작).
 */
export function sponsorStreakMultiplier(streak: number): number {
  return 1 + Math.min(streak, SPONSOR_STREAK_CAP) * SPONSOR_STREAK_BONUS_PER_STREAK;
}
