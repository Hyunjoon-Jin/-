/**
 * 선수 성장·노화 (engine.md 1.4).
 * 시즌 경계에서 나이 +1, 잠재력을 향한 성장 / 노장 신체 능력 하락,
 * 잔여 계약 감소, 주급 갱신을 일괄 적용한다.
 */
import type { AttrKey, Player } from './types.js';
import {
  TECHNICAL_ATTRS, MENTAL_ATTRS, PHYSICAL_ATTRS, GOALKEEPING_ATTRS,
} from './types.js';
import { currentAbility } from './derived.js';
import { weeklyWage } from './valuation.js';
import { clamp } from './math.js';
import type { Rng } from './rng.js';

/** CA 1포인트 ≈ 능력치 합 3.6 변화 (CA = 평균×10, 평균 = 합/36). */
const CA_PER_ATTR_POINT = 10 / 36;

/** 나이별 성장률 (잠재력 갭의 몇 %를 이번 시즌에 실현하는가). */
function developmentRate(age: number): number {
  if (age <= 20) return 0.35;
  if (age <= 23) return 0.20;
  if (age <= 26) return 0.10;
  if (age <= 29) return 0.05;
  return 0;
}

/** 노장 하락폭 (CA 단위). naturalFitness가 높으면 완화. */
function declineCA(age: number, naturalFitness: number): number {
  let base = 0;
  if (age >= 36) base = 6;
  else if (age >= 33) base = 4;
  else if (age >= 30) base = 2.5;
  if (base === 0) return 0;
  const fitnessRelief = (naturalFitness / 20) * 0.6; // 최대 60% 완화
  return base * (1 - fitnessRelief);
}

function relevantGrowthAttrs(player: Player): AttrKey[] {
  if (player.position === 'GK') {
    return [...GOALKEEPING_ATTRS, ...MENTAL_ATTRS];
  }
  return [...TECHNICAL_ATTRS, ...MENTAL_ATTRS, ...PHYSICAL_ATTRS];
}

/** 노화로 먼저 떨어지는 신체 능력. */
const DECLINE_ATTRS: AttrKey[] = [
  'pace', 'acceleration', 'agility', 'jumping', 'stamina', 'strength',
];

/** points만큼 무작위 능력치를 ±1 적용 (clamp 1~20). */
function applyPoints(
  player: Player, pool: AttrKey[], points: number, dir: 1 | -1, rng: Rng,
): void {
  let remaining = Math.abs(Math.round(points));
  let guard = remaining * 4 + 8; // 무한루프 방지
  while (remaining > 0 && guard-- > 0) {
    const key = pool[rng.int(0, pool.length - 1)]!;
    const next = clamp(player.attributes[key] + dir, 1, 20);
    if (next !== player.attributes[key]) {
      player.attributes[key] = next;
      remaining--;
    }
  }
}

/**
 * 한 선수의 시즌 경계 진행. 객체를 직접 변경한다.
 */
export function progressPlayer(player: Player, rng: Rng): void {
  player.age += 1;
  player.contractYears = Math.max(0, player.contractYears - 1);

  const ca = currentAbility(player);
  const rate = developmentRate(player.age);

  if (rate > 0 && ca < player.potential) {
    const gap = player.potential - ca;
    const gainCA = gap * rate * (0.6 + rng.next() * 0.8); // 무작위 변동
    const points = gainCA / CA_PER_ATTR_POINT;
    applyPoints(player, relevantGrowthAttrs(player), points, 1, rng);
  } else if (player.age >= 30) {
    const lossCA = declineCA(player.age, player.attributes.naturalFitness);
    if (lossCA > 0) {
      const points = lossCA / CA_PER_ATTR_POINT;
      applyPoints(player, DECLINE_ATTRS, points, -1, rng);
    }
  }

  player.wage = weeklyWage(player);
}
