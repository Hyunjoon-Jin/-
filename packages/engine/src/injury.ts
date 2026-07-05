/**
 * 부상 등급·부위 세분화 (콘텐츠 심화).
 * 부상 발생 시 경미/중등도/중상 등급과 부위 명칭을 부여한다.
 * 의료 스태프가 높을수록 경미 비중·회복 기간이 줄어 스태프 가치가 커진다.
 */
import type { Rng } from './rng.js';
import { clamp } from './math.js';

export type InjurySeverity = 'minor' | 'moderate' | 'serious';

/** 부상 부위 대분류 — 복귀 후 능력치 회복 지연(회복 지연 대상 능력치)에 사용. */
export type BodyPart = 'hamstring' | 'knee' | 'ankle' | 'general';

export interface Injury {
  /** 결장 경기 수. */
  matches: number;
  severity: InjurySeverity;
  /** 부위/부상 명칭. */
  name: string;
  bodyPart: BodyPart;
}

export const SEVERITY_LABEL: Record<InjurySeverity, string> = {
  minor: '경미', moderate: '중등도', serious: '중상',
};

interface InjuryTemplate { name: string; bodyPart: BodyPart; }

const TEMPLATES: Record<InjurySeverity, InjuryTemplate[]> = {
  minor: [
    { name: '근육 뭉침', bodyPart: 'general' },
    { name: '타박상', bodyPart: 'general' },
    { name: '발목 가벼운 염좌', bodyPart: 'ankle' },
    { name: '종아리 경련', bodyPart: 'hamstring' },
  ],
  moderate: [
    { name: '햄스트링 부상', bodyPart: 'hamstring' },
    { name: '발목 인대 손상', bodyPart: 'ankle' },
    { name: '허벅지 근육 파열', bodyPart: 'hamstring' },
    { name: '정강이 부상', bodyPart: 'general' },
  ],
  serious: [
    { name: '무릎 십자인대 손상', bodyPart: 'knee' },
    { name: '아킬레스건 파열', bodyPart: 'ankle' },
    { name: '골절', bodyPart: 'general' },
    { name: '뇌진탕', bodyPart: 'general' },
  ],
};

const RANGE: Record<InjurySeverity, [number, number]> = {
  minor: [1, 2], moderate: [3, 6], serious: [7, 14],
};

/** 복귀 직후 재부상 위험이 유지되는 경기 수 — 이 구간 동안 부상 확률이 가산된다. */
export const REINJURY_RISK_WINDOW = 5;
/** 재부상 위험 구간 시작 시점의 부상 확률 배율(구간이 끝나갈수록 1.0으로 선형 감쇠). */
const REINJURY_RISK_MUL = 1.5;

/** 남은 재부상 위험 경기 수 → 부상 확률 배율(1.0~REINJURY_RISK_MUL). */
export function reinjuryRiskFactor(remaining?: number): number {
  const r = clamp(remaining ?? 0, 0, REINJURY_RISK_WINDOW);
  if (r <= 0) return 1;
  const ratio = r / REINJURY_RISK_WINDOW;
  return 1 + (REINJURY_RISK_MUL - 1) * ratio;
}

/** 복귀 후 부상 부위 연관 능력치가 회복될 때까지 걸리는 경기 수. */
export const RECOVERY_ATTR_WINDOW = 4;

/** 의료 레벨(1~20)에 따른 원시 배율 편향(10=1.0, 20≈0.7, 1≈1.27) — 회복 기간·
 *  부상 발생 확률 계수가 공유하는 베이스 공식. 호출부마다 다른 범위로 clamp한다. */
export function medicalBias(medical: number): number {
  return 1 - (medical - 10) * 0.03;
}

/** 의료 레벨(1~20) → 회복 기간 배율(10=1.0x, 20≈0.7x, 1≈1.27x). */
function durationFactor(medical: number): number {
  return clamp(medicalBias(medical), 0.6, 1.3);
}

/**
 * 부상 1건 생성. 의료가 높을수록 경미 비중↑·기간↓.
 * @param rng 시드 고정 난수.
 */
export function rollInjury(rng: Rng, medical: number): Injury {
  const medAdj = clamp((medical - 10) * 0.02, -0.2, 0.2); // 의료↑ → 경미 확률↑
  const pMinor = clamp(0.55 + medAdj, 0.35, 0.8);
  // 의료가 좋을수록 중상 비중도 함께 낮아지되, 완전히 사라지지는 않는다(최소 3%).
  // pMinor+pModerate가 1을 넘어 중상 확률이 마이너스(=사실상 0%)가 되던 문제를 막기
  // 위해 세 등급의 확률을 항상 합이 1이 되도록 정규화한다.
  const pSerious = clamp(0.13 - medAdj * 0.5, 0.03, 0.18);
  const pModerate = 1 - pMinor - pSerious;

  const r = rng.next();
  const severity: InjurySeverity =
    r < pMinor ? 'minor' : r < pMinor + pModerate ? 'moderate' : 'serious';

  const [lo, hi] = RANGE[severity];
  const matches = Math.max(1, Math.round(rng.int(lo, hi) * durationFactor(medical)));
  const pool = TEMPLATES[severity];
  const template = pool[rng.int(0, pool.length - 1)]!;
  return { matches, severity, name: template.name, bodyPart: template.bodyPart };
}
