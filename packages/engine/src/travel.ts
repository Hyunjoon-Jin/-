/**
 * 원정 이동 부담(고도화 항목48) — 경기 시드+양 구단 id로 결정되는 순수 함수라
 * RNG를 전혀 소비하지 않는다(기존 경기 시뮬 RNG 시퀀스에 영향 없음, 하위 호환).
 * 구단 간 실제 지리 데이터는 없어 "이동 거리"를 직접 모델링하지 않고, 매치별로
 * 결정론적인 이동 부담 카테고리(단거리/중거리/장거리)를 부여한다 — 장거리일수록
 * 원정팀 선발 출전자의 경기 후 컨디션이 소폭 더 떨어진다(홈팀은 영향 없음).
 */
import { hashSeed } from './math.js';

export type TravelBurden = 'short' | 'medium' | 'long';

export const TRAVEL_BURDEN_LABEL: Record<TravelBurden, string> = {
  short: '단거리 이동', medium: '중거리 이동', long: '장거리 원정',
};

const TRAVEL_MEDIUM_CHANCE = 0.3;
const TRAVEL_LONG_CHANCE = 0.2;

/** 원정 이동 부담 결정(결정론적) — 같은 시드+양 구단 조합이면 항상 같은 부담. */
export function matchTravelBurden(seed: number, homeClubId: string, awayClubId: string): TravelBurden {
  const roll = hashSeed(`travel:${seed}:${homeClubId}:${awayClubId}`) % 100;
  if (roll < TRAVEL_LONG_CHANCE * 100) return 'long';
  if (roll < (TRAVEL_LONG_CHANCE + TRAVEL_MEDIUM_CHANCE) * 100) return 'medium';
  return 'short';
}

/** 이동 부담별 원정팀 선발 출전자 추가 컨디션 하락(고도화 항목48). 단거리는 0(기존과 동일). */
export const TRAVEL_CONDITION_PENALTY: Record<TravelBurden, number> = {
  short: 0, medium: 0.02, long: 0.045,
};
