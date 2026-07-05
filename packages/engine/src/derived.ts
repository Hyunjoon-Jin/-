/**
 * 선수 파생 능력치 계산 (engine.md 1.3, 3장).
 * 36개 원시 능력치(1~20) → 역할별 가중 평균 → 0~100 정규화.
 * 컨디션·사기·포지션 숙련도 보정까지 포함.
 */
import type { Attributes, AttrKey, Player, Position } from './types.js';
import { ALL_ATTRS } from './types.js';
import { DERIVED_WEIGHTS, type DerivedKey, type Weights } from './roleWeights.js';
import { clamp, weightedMean } from './math.js';
import { hasTrait } from './traits.js';
import { RECOVERY_ATTR_WINDOW, type BodyPart } from './injury.js';

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
function derivedRaw(attrs: Attributes, weights: Weights): number {
  const mean = weightedMean(
    attrs as unknown as Record<string, number>,
    weights as Record<string, number>,
  );
  // 1~20 → 0~100. (값-1)/19*100.
  return clamp(((mean - 1) / 19) * 100, 0, 100);
}

/** 부상 부위별 회복 지연 대상 능력치. */
const BODY_PART_ATTRS: Record<BodyPart, AttrKey[]> = {
  hamstring: ['pace', 'acceleration'],
  knee: ['agility', 'balance'],
  ankle: ['agility', 'balance'],
  general: [],
};
/** 복귀 직후 최대 감쇠율(구간이 끝나갈수록 0으로 선형 수렴). */
const RECOVERY_ATTR_PENALTY_MAX = 0.25;

/** 부상 부위 연관 능력치에 회복 지연 페널티를 적용한 능력치 사본(없으면 원본 그대로). */
function withRecoveryPenalty(player: Player): Attributes {
  const remaining = player.recoveryAttrMatches ?? 0;
  const bodyPart = player.injuryBodyPart;
  if (remaining <= 0 || !bodyPart) return player.attributes;
  const keys = BODY_PART_ATTRS[bodyPart];
  if (keys.length === 0) return player.attributes;
  const ratio = clamp(remaining / RECOVERY_ATTR_WINDOW, 0, 1);
  const mul = 1 - RECOVERY_ATTR_PENALTY_MAX * ratio;
  const adjusted = { ...player.attributes };
  for (const k of keys) adjusted[k] = clamp(adjusted[k] * mul, 1, 20);
  return adjusted;
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
 * @param isBigMatch 라이벌전·컵 결승 등 큰 경기 여부 — 빅게임 히어로/새가슴 특성에만 영향.
 */
export function playerDerived(player: Player, slot: Position, isBigMatch = false): DerivedRatings {
  const fam = familiarityAt(player, slot);
  const cond = conditionFactor(player);
  const mor = moraleFactor(player);
  const adj = fam * cond * mor;
  const attrs = withRecoveryPenalty(player);

  const keys: DerivedKey[] = [
    'attack', 'creation', 'midfield', 'defense', 'physical', 'aerial', 'gk',
  ];
  const out = {} as DerivedRatings;
  for (const k of keys) {
    out[k] = derivedRaw(attrs, DERIVED_WEIGHTS[k]) * adj;
  }
  // 특성 보정: 골잡이(공격)·플레이메이커(창출)·수비 바위(수비).
  if (hasTrait(player, 'poacher')) out.attack *= 1.08;
  if (hasTrait(player, 'playmaker')) out.creation *= 1.08;
  if (hasTrait(player, 'rock')) out.defense *= 1.08;
  // 빅게임 히어로/새가슴: 큰 경기에서만 전반적 기량이 오르내린다.
  if (isBigMatch) {
    const bigMatchMul = hasTrait(player, 'bigGameHero') ? 1.08
      : hasTrait(player, 'bigGameChoker') ? 0.92 : 1;
    if (bigMatchMul !== 1) {
      for (const k of keys) out[k] *= bigMatchMul;
    }
  }
  return out;
}
