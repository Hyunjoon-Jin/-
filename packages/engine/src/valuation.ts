/**
 * 선수 시장 가치 & 주급 산정 (economy.md 2·3장).
 * 단위: 만원.
 */
import type { Player } from './types.js';
import { currentAbility } from './derived.js';
import { clamp } from './math.js';

function ageFactor(age: number): number {
  if (age <= 20) return 1.10;
  if (age <= 24) return 1.15;
  if (age <= 27) return 1.00;
  if (age <= 30) return 0.80;
  if (age <= 32) return 0.55;
  return 0.30;
}

function youthWeight(age: number): number {
  if (age <= 21) return 0.8;
  if (age <= 24) return 0.4;
  return 0.1;
}

function potentialFactor(ca: number, pa: number, age: number): number {
  const room = clamp(pa - ca, 0, 60);
  return 1 + (room / 60) * youthWeight(age);
}

function contractFactor(years: number): number {
  if (years <= 1) return 0.5;
  if (years === 2) return 0.75;
  return 1.0;
}

/** 시장 가치 (만원). economy.md 2장. */
export function marketValue(player: Player): number {
  const ca = currentAbility(player);
  const base = Math.pow(ca / 100, 3) * 200_000;
  const v =
    base *
    ageFactor(player.age) *
    potentialFactor(ca, player.potential, player.age) *
    contractFactor(player.contractYears);
  return Math.max(0, Math.round(v));
}

function ageWageFactor(age: number): number {
  if (age <= 21) return 0.7;
  if (age <= 23) return 0.85;
  if (age <= 30) return 1.0;
  if (age <= 32) return 0.95;
  return 0.9;
}

/** 주급 (만원). economy.md 3장. */
export function weeklyWage(player: Player): number {
  const ca = currentAbility(player);
  return Math.max(0, Math.round(Math.pow(ca / 100, 2) * 900 * ageWageFactor(player.age)));
}

/** 에이전트 수수료 기준 계약 연수(4년 기준 요율). */
const AGENT_FEE_BASE_YEARS = 4;
/** 이적료 대비 에이전트 수수료 요율(기준 계약 연수 기준). */
const AGENT_FEE_RATE = 0.05;

/**
 * 에이전트 수수료 (만원). 이적료와 별개로 이적 예산이 아닌 구단 잔고에서 차감된다.
 * 계약 연수가 길수록(에이전트가 더 오랜 기간의 미래 수입을 협상하므로) 수수료도 커진다.
 */
export function agentFee(fee: number, contractYears: number): number {
  return Math.max(0, Math.round(fee * AGENT_FEE_RATE * (contractYears / AGENT_FEE_BASE_YEARS)));
}

// ── 로열티 보너스 (신규 개선 항목 10) ────────────────────────

/** 로열티 등급 — 한 구단에서 이적 없이 보낸 시즌 수(Player.seasonsAtClub) 기준. */
export type LoyaltyTier = 'newcomer' | 'trusted' | 'legend';

/** trusted 등급 진입 문턱(시즌). 이 미만은 newcomer로 보너스가 없다. */
export const LOYALTY_TRUSTED_SEASONS = 3;
/** legend 등급 진입 문턱(시즌) — 이 이상이면 최대 할인이 적용된다. */
export const LOYALTY_LEGEND_SEASONS = 6;
/** legend 등급에서 재계약 계약금에 적용되는 최대 할인율. */
export const LOYALTY_MAX_DISCOUNT = 0.2;

/** 한 구단에서 보낸 시즌 수를 로열티 등급으로 분류(UI 표시용). */
export function loyaltyTier(seasonsAtClub: number): LoyaltyTier {
  if (seasonsAtClub >= LOYALTY_LEGEND_SEASONS) return 'legend';
  if (seasonsAtClub >= LOYALTY_TRUSTED_SEASONS) return 'trusted';
  return 'newcomer';
}

/**
 * 로열티가 재계약 계약금에 주는 할인율(0~LOYALTY_MAX_DISCOUNT) — 오래 뛴 선수일수록
 * 이적 없이 남아준 것에 대한 보답으로 재계약이 저렴해진다. trusted 문턱부터 선형으로
 * 늘어 legend 문턱에서 최대치에 도달한다.
 */
export function loyaltyDiscount(seasonsAtClub: number): number {
  if (seasonsAtClub < LOYALTY_TRUSTED_SEASONS) return 0;
  const span = LOYALTY_LEGEND_SEASONS - LOYALTY_TRUSTED_SEASONS;
  const progress = clamp((seasonsAtClub - LOYALTY_TRUSTED_SEASONS) / span, 0, 1);
  return progress * LOYALTY_MAX_DISCOUNT;
}
