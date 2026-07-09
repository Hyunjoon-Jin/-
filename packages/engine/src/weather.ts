/**
 * 경기 날씨(신규 개선 항목 26, 고도화 항목47) — 경기 시드+양 구단 id로 결정되는
 * 순수 함수라 RNG를 전혀 소비하지 않는다(기존 경기 시뮬 RNG 시퀀스에 영향 없음,
 * 하위 호환). 비 오는 날은 패스·연계 플레이가 더 어렵고, 바람 부는 날은 크로스·
 * 중거리 슈팅이 흔들려 양 팀 모두의 전개력이 약간 떨어진다. 폭염은 체력 소모를
 * 가속시키고(경기 후 피로 증가), 혹한은 부상 위험을 소폭 높인다.
 */
import { hashSeed } from './math.js';

export type Weather = 'clear' | 'rain' | 'windy' | 'heat' | 'cold';

export const WEATHER_LABEL: Record<Weather, string> = {
  clear: '맑음', rain: '비', windy: '강풍', heat: '폭염', cold: '혹한',
};

const WEATHER_RAIN_CHANCE = 0.18;
const WEATHER_WINDY_CHANCE = 0.12;
const WEATHER_HEAT_CHANCE = 0.08;
const WEATHER_COLD_CHANCE = 0.07;

/** 경기 날씨 결정(결정론적) — 같은 시드+양 구단 조합이면 항상 같은 날씨. */
export function matchWeather(seed: number, homeClubId: string, awayClubId: string): Weather {
  const roll = hashSeed(`weather:${seed}:${homeClubId}:${awayClubId}`) % 100;
  if (roll < WEATHER_RAIN_CHANCE * 100) return 'rain';
  if (roll < (WEATHER_RAIN_CHANCE + WEATHER_WINDY_CHANCE) * 100) return 'windy';
  if (roll < (WEATHER_RAIN_CHANCE + WEATHER_WINDY_CHANCE + WEATHER_HEAT_CHANCE) * 100) return 'heat';
  if (roll < (WEATHER_RAIN_CHANCE + WEATHER_WINDY_CHANCE + WEATHER_HEAT_CHANCE + WEATHER_COLD_CHANCE) * 100) {
    return 'cold';
  }
  return 'clear';
}

/** 날씨별 전개력(창조성) 배율 — 비는 패스·연계에 가장 크게 지장을 준다. */
export const WEATHER_CREATION_MULTIPLIER: Record<Weather, number> = {
  clear: 1, rain: 0.9, windy: 0.95, heat: 0.95, cold: 0.97,
};

/** 날씨별 공격력 배율 — 창조력보다는 영향이 작다(피니시 자체는 덜 흔들림). */
export const WEATHER_ATTACK_MULTIPLIER: Record<Weather, number> = {
  clear: 1, rain: 0.96, windy: 0.97, heat: 0.97, cold: 0.98,
};

/** 날씨별 경기 후 체력 소모 배율(고도화 항목47) — 폭염만 유의미하게 가속. */
export const WEATHER_FATIGUE_MULTIPLIER: Record<Weather, number> = {
  clear: 1, rain: 1, windy: 1, heat: 1.25, cold: 1,
};

/** 날씨별 부상 위험 배율(고도화 항목47) — 혹한만 유의미하게 상승(경직된 근육). */
export const WEATHER_INJURY_MULTIPLIER: Record<Weather, number> = {
  clear: 1, rain: 1, windy: 1, heat: 1, cold: 1.2,
};
