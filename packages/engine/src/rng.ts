/**
 * 시드 기반 결정론적 난수 생성기 (mulberry32).
 * 같은 시드 → 같은 수열. 경기 재현성·테스트의 토대 (engine.md 4.1).
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // 0이면 수열이 죽으므로 보정.
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** [0, 1) 균등 난수. */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 확률 p로 true. */
  roll(p: number): boolean {
    return this.next() < p;
  }

  /** [min, max] 정수. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 평균 0, 표준편차 1 근사 정규분포 (Box-Muller). */
  gaussian(): number {
    const u = this.next() || 1e-9;
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** 배열에서 하나 균등 선택. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)]!;
  }
}
