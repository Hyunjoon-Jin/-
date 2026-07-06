/** 공용 수학 유틸. */

export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

/** 로지스틱 함수. 능력차 → 확률 매핑 (engine.md 4.3). */
export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** 문자열 → 32비트 해시(결정론적, RNG 불필요 — Rng 컨텍스트가 없는 유저 액션에서 쓴다). */
export function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 가중 평균. weights 합으로 정규화. */
export function weightedMean(
  values: Record<string, number>,
  weights: Record<string, number>,
): number {
  let sum = 0;
  let wsum = 0;
  for (const key in weights) {
    const w = weights[key]!;
    sum += (values[key] ?? 0) * w;
    wsum += w;
  }
  return wsum === 0 ? 0 : sum / wsum;
}
