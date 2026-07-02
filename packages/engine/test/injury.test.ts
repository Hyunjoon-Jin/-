import { describe, it, expect } from 'vitest';
import { rollInjury, SEVERITY_LABEL, type InjurySeverity } from '../src/injury.js';
import { Rng } from '../src/rng.js';

describe('injury: 부상 등급·기간', () => {
  it('등급별 기간 범위가 지켜진다(경미<중등도<중상 대역)', () => {
    // 여러 표본에서 등급별 최소/최대 기간 확인
    const range: Record<InjurySeverity, [number, number]> = {
      minor: [1, 2], moderate: [3, 6], serious: [7, 14],
    };
    for (let s = 0; s < 300; s++) {
      const inj = rollInjury(new Rng(s), 10); // 중립 의료(기간 배율 1.0)
      const [lo, hi] = range[inj.severity];
      expect(inj.matches).toBeGreaterThanOrEqual(1);
      expect(inj.matches).toBeLessThanOrEqual(hi);
      expect(inj.matches).toBeGreaterThanOrEqual(Math.max(1, lo));
      expect(inj.name.length).toBeGreaterThan(0);
      expect(SEVERITY_LABEL[inj.severity]).toBeTruthy();
    }
  });

  it('의료가 높으면 평균 결장 기간이 짧다', () => {
    const avg = (medical: number) => {
      let sum = 0;
      for (let s = 0; s < 400; s++) sum += rollInjury(new Rng(s + 1000), medical).matches;
      return sum / 400;
    };
    expect(avg(20)).toBeLessThan(avg(3));
  });

  it('의료가 높으면 경미 비중이 높다', () => {
    const minorRate = (medical: number) => {
      let minor = 0;
      for (let s = 0; s < 400; s++) if (rollInjury(new Rng(s + 5000), medical).severity === 'minor') minor++;
      return minor / 400;
    };
    expect(minorRate(20)).toBeGreaterThan(minorRate(3));
  });

  it('동일 시드면 동일 부상 (재현성)', () => {
    const a = rollInjury(new Rng(42), 12);
    const b = rollInjury(new Rng(42), 12);
    expect(a).toEqual(b);
  });
});
