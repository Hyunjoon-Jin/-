/**
 * 선수 파생 능력치 계산 (engine.md 1.3, 3장).
 * 36개 원시 능력치(1~20) → 역할별 가중 평균 → 0~100 정규화.
 * 컨디션·사기·포지션 숙련도 보정까지 포함.
 */
import type { Player, Position } from './types.js';
import { ALL_ATTRS } from './types.js';
import { DERIVED_WEIGHTS, type DerivedKey, type Weights } from './roleWeights.js';
import { clamp, weightedMean } from './math.js';
import { hasTrait } from './traits.js';

/** 부상 여부. */
export function isInjured(player: Player): boolean {
  return player.injuryMatches > 0;
}

/** 출전 정지 여부. */
export function isSuspended(player: Player): boolean {
  return player.suspensionMatches > 0;
}

/** 출전 가능 여부 (부상·정지 아님). */
export function isAvailable(player: Player): boolean {
  return player.injuryMatches === 0 && player.suspensionMatches === 0;
}

/**
 * 현재 능력(CA) 근사: 36개 능력치 평균 × 10 (0~200 척도).
 * 가치·연봉·성장 계산의 공통 기준 (engine.md 1.4 단순화판).
 */
export function currentAbility(player: Player): number {
  const sum = ALL_ATTRS.reduce((s, k) => s + player.attributes[k], 0);
  return (sum / ALL_ATTRS.length) * 10;
}

/** 원시 능력치(1~20) 가중평균을 0~100으로 정규화. */
function derivedRaw(player: Player, weights: Weights): number {
  const mean = weightedMean(
    player.attributes as unknown as Record<string, number>,
    weights as Record<string, number>,
  );
  // 1~20 → 0~100. (값-1)/19*100.
  return clamp(((mean - 1) / 19) * 100, 0, 100);
}

/** 컨디션 보정 (0.6~1.0). engine.md 3장. */
export function conditionFactor(player: Player): number {
  return clamp(0.6 + 0.4 * player.condition, 0.6, 1.0);
}

/** 사기 보정 (0.9~1.05). */
export function moraleFactor(player: Player): number {
  return clamp(0.9 + 0.15 * player.morale, 0.9, 1.05);
}

/** 특정 슬롯 포지션에서 뛸 때의 숙련도 (0~1). 미지정 포지션은 0.2. */
export function familiarityAt(player: Player, slot: Position): number {
  if (player.position === slot) return 1.0;
  return player.familiarity[slot] ?? 0.2;
}

export interface DerivedRatings {
  attack: number;
  creation: number;
  midfield: number;
  defense: number;
  physical: number;
  aerial: number;
  gk: number;
}

/**
 * 선수의 보정된 파생 능력치.
 * effective = raw × familiarity × condition × morale (engine.md 3장).
 */
export function playerDerived(player: Player, slot: Position): DerivedRatings {
  const fam = familiarityAt(player, slot);
  const cond = conditionFactor(player);
  const mor = moraleFactor(player);
  const adj = fam * cond * mor;

  const keys: DerivedKey[] = [
    'attack', 'creation', 'midfield', 'defense', 'physical', 'aerial', 'gk',
  ];
  const out = {} as DerivedRatings;
  for (const k of keys) {
    out[k] = derivedRaw(player, DERIVED_WEIGHTS[k]) * adj;
  }
  // 특성 보정: 골잡이(공격)·플레이메이커(창출)·수비 바위(수비).
  if (hasTrait(player, 'poacher')) out.attack *= 1.08;
  if (hasTrait(player, 'playmaker')) out.creation *= 1.08;
  if (hasTrait(player, 'rock')) out.defense *= 1.08;
  return out;
}
