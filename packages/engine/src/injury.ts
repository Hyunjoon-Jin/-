/**
 * 부상 등급·부위 세분화 (콘텐츠 심화).
 * 부상 발생 시 경미/중등도/중상 등급과 부위 명칭을 부여한다.
 * 의료 스태프가 높을수록 경미 비중·회복 기간이 줄어 스태프 가치가 커진다.
 */
import type { Rng } from './rng.js';
import { clamp } from './math.js';

export type InjurySeverity = 'minor' | 'moderate' | 'serious';

export interface Injury {
  /** 결장 경기 수. */
  matches: number;
  severity: InjurySeverity;
  /** 부위/부상 명칭. */
  name: string;
}

export const SEVERITY_LABEL: Record<InjurySeverity, string> = {
  minor: '경미', moderate: '중등도', serious: '중상',
};

const NAMES: Record<InjurySeverity, string[]> = {
  minor: ['근육 뭉침', '타박상', '발목 가벼운 염좌', '종아리 경련'],
  moderate: ['햄스트링 부상', '발목 인대 손상', '허벅지 근육 파열', '정강이 부상'],
  serious: ['무릎 십자인대 손상', '아킬레스건 파열', '골절', '뇌진탕'],
};

const RANGE: Record<InjurySeverity, [number, number]> = {
  minor: [1, 2], moderate: [3, 6], serious: [7, 14],
};

/** 의료 레벨(1~20) → 회복 기간 배율(10=1.0x, 20≈0.7x, 1≈1.27x). */
function durationFactor(medical: number): number {
  return clamp(1 - (medical - 10) * 0.03, 0.6, 1.3);
}

/**
 * 부상 1건 생성. 의료가 높을수록 경미 비중↑·기간↓.
 * @param rng 시드 고정 난수.
 */
export function rollInjury(rng: Rng, medical: number): Injury {
  const medAdj = clamp((medical - 10) * 0.02, -0.2, 0.2); // 의료↑ → 경미 확률↑
  const pMinor = clamp(0.55 + medAdj, 0.4, 0.8);
  const pModerate = 0.32;

  const r = rng.next();
  const severity: InjurySeverity =
    r < pMinor ? 'minor' : r < pMinor + pModerate ? 'moderate' : 'serious';

  const [lo, hi] = RANGE[severity];
  const matches = Math.max(1, Math.round(rng.int(lo, hi) * durationFactor(medical)));
  const pool = NAMES[severity];
  const name = pool[rng.int(0, pool.length - 1)]!;
  return { matches, severity, name };
}
