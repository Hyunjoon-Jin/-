/**
 * 심판 엄격도(고도화 항목46) — 경기 시드+양 구단 id로 결정되는 순수 함수라
 * RNG를 전혀 소비하지 않는다(기존 경기 시뮬 RNG 시퀀스에 영향 없음, 하위 호환).
 * 카드 판정 자체는 여전히 독립 RNG 스트림(generateCards)에서 굴리되, 그 확률에
 * 곱하는 배율만 심판 성향에 따라 달라진다 — 굴림 횟수·순서는 그대로다.
 */
import { hashSeed } from './math.js';

export type RefereeStrictness = 'lenient' | 'normal' | 'strict';

export const REFEREE_STRICTNESS_LABEL: Record<RefereeStrictness, string> = {
  lenient: '관대함', normal: '보통', strict: '엄격함',
};

const REFEREE_LENIENT_CHANCE = 0.25;
const REFEREE_STRICT_CHANCE = 0.25;

/** 심판 엄격도 결정(결정론적) — 같은 시드+양 구단 조합이면 항상 같은 성향. */
export function matchRefereeStrictness(seed: number, homeClubId: string, awayClubId: string): RefereeStrictness {
  const roll = hashSeed(`referee:${seed}:${homeClubId}:${awayClubId}`) % 100;
  if (roll < REFEREE_LENIENT_CHANCE * 100) return 'lenient';
  if (roll < (REFEREE_LENIENT_CHANCE + REFEREE_STRICT_CHANCE) * 100) return 'strict';
  return 'normal';
}

/** 심판 엄격도별 카드(옐로·레드 공통) 확률 배율. */
export const REFEREE_CARD_MULTIPLIER: Record<RefereeStrictness, number> = {
  lenient: 0.7, normal: 1, strict: 1.35,
};
