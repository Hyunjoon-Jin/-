/** 공용 수학 유틸. */

export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

/** 로지스틱 함수. 능력차 → 확률 매핑 (engine.md 4.3). */
export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
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
